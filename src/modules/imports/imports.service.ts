import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportType, MembershipType, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { MembersService } from '../members/members.service';
import { FinancesService } from '../finances/finances.service';
import { Cell, MAX_ROWS, readSpreadsheet } from './spreadsheet';
import {
  FieldDef,
  IMPORT_FIELDS,
  Mapping,
  autoMap,
  dayOfHeader,
  detectHeaderRow,
  pickSheet,
} from './import-fields';
import {
  addDays,
  cleanText,
  daysBetween,
  isAttendanceMark,
  localDate,
  normalizeKey,
  parseAmount,
  parseDate,
  parseEmail,
  parseIdentification,
  parseInteger,
  parsePaymentStatus,
  parsePhone,
  splitFullName,
  titleCase,
} from './normalize';
import {
  AttendanceImportRowDto,
  CreateImportJobDto,
  MemberImportRowDto,
  MembersImportOptionsDto,
  PreviewImportDto,
} from './dto/import.dto';

export type RowStatus = 'NEW' | 'EXISTING' | 'DUPLICATE' | 'ERROR' | 'IGNORED';
export type CommitStatus = 'CREATED' | 'UPDATED' | 'SKIPPED' | 'FAILED';

export type PreviewRow<T> = {
  row: number; // número de fila en el Excel (1-based), para el reporte
  status: RowStatus;
  data: T | null;
  errors: string[];
  warnings: string[];
  match?: { memberId: string; name: string; by: string } | null;
};

export type CommitResult = { row: number; status: CommitStatus; message: string };

// Verificaciones del archivo: filas de resumen que la planilla trae debajo de
// los datos (totales, "Gastos al 29/08"…). No se importan, pero el total
// declarado sirve para comprobar que se leyeron todas las filas.
export type FileChecks = {
  totals: {
    row: number;
    declaredAmount: number | null;
    declaredAmountBs: number | null;
    computedAmount: number;
    computedAmountBs: number;
    rowsCounted: number;
    matches: boolean;
  } | null;
  summaryRows: { row: number; text: string }[];
};

type MemberIndexEntry = {
  id: string;
  name: string;
  externalId: string | null;
  identificationNumber: string;
  email: string;
};

type MemberIndex = {
  byExternal: Map<string, MemberIndexEntry>;
  byIdNumber: Map<string, MemberIndexEntry>;
  byEmail: Map<string, MemberIndexEntry>;
  byName: Map<string, MemberIndexEntry[]>;
};

type PlanRow = { id: string; name: string; type: MembershipType; durationDays: number; price: Prisma.Decimal };

const PLACEHOLDER_ID_PREFIX = 'SINCI';
const PLACEHOLDER_EMAIL_DOMAIN = 'sin-correo.invalid';
const MAX_ISSUES = 1000;

// Palabras del plan → tipo de membresía (para encontrar el plan existente).
const PLAN_KEYWORDS: [RegExp, MembershipType][] = [
  [/diari|dia |por sesion|sesion/, 'DAILY'],
  [/mensual|mes/, 'MONTHLY'],
  [/trimestral|trimestre/, 'QUARTERLY'],
  [/anual|ano/, 'ANNUAL'],
];

@Injectable()
export class ImportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly members: MembersService,
    private readonly finances: FinancesService,
  ) {}

  // ------------------------------------------------------------------
  // Índices de socios y planes (para detectar duplicados)
  // ------------------------------------------------------------------

  private async loadMemberIndex(gymId: string): Promise<MemberIndex> {
    const rows = await this.prisma.member.findMany({
      where: { gymId },
      select: {
        id: true,
        externalId: true,
        identificationNumber: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    const index: MemberIndex = { byExternal: new Map(), byIdNumber: new Map(), byEmail: new Map(), byName: new Map() };
    for (const m of rows) this.addToIndex(index, {
      id: m.id,
      name: `${m.user.profile?.firstName ?? ''} ${m.user.profile?.lastName ?? ''}`.trim(),
      externalId: m.externalId,
      identificationNumber: m.identificationNumber,
      email: m.user.email,
    });
    return index;
  }

  private addToIndex(index: MemberIndex, entry: MemberIndexEntry) {
    if (entry.externalId) index.byExternal.set(entry.externalId.toLowerCase(), entry);
    index.byIdNumber.set(entry.identificationNumber.toUpperCase(), entry);
    index.byEmail.set(entry.email.toLowerCase(), entry);
    const key = normalizeKey(entry.name);
    if (key) index.byName.set(key, [...(index.byName.get(key) ?? []), entry]);
  }

  // Orden de confianza: ID externo > cédula > email > nombre (solo si es único).
  private findMember(
    index: MemberIndex,
    q: { externalId?: string | null; identificationNumber?: string | null; email?: string | null; name?: string | null },
  ): { entry: MemberIndexEntry | null; by: string; ambiguous: boolean } {
    if (q.externalId) {
      const e = index.byExternal.get(q.externalId.toLowerCase());
      if (e) return { entry: e, by: 'ID', ambiguous: false };
    }
    if (q.identificationNumber) {
      const e = index.byIdNumber.get(q.identificationNumber.toUpperCase());
      if (e) return { entry: e, by: 'cédula', ambiguous: false };
    }
    if (q.email) {
      const e = index.byEmail.get(q.email.toLowerCase());
      if (e) return { entry: e, by: 'email', ambiguous: false };
    }
    const byName = q.name ? index.byName.get(normalizeKey(q.name)) ?? [] : [];
    if (byName.length === 1) return { entry: byName[0], by: 'nombre', ambiguous: false };
    return { entry: null, by: '', ambiguous: byName.length > 1 };
  }

  private async loadPlans(gymId: string): Promise<PlanRow[]> {
    return this.prisma.membershipPlan.findMany({
      where: { gymId },
      select: { id: true, name: true, type: true, durationDays: true, price: true },
    });
  }

  private findPlan(plans: PlanRow[], name: string | null | undefined): PlanRow | null {
    if (!name) return null;
    const key = normalizeKey(name);
    const exact = plans.find((p) => normalizeKey(p.name) === key);
    if (exact) return exact;
    const type = PLAN_KEYWORDS.find(([re]) => re.test(`${key} `))?.[1];
    const ofType = type ? plans.filter((p) => p.type === type) : [];
    return ofType.length === 1 ? ofType[0] : null;
  }

  private inferPlanType(days: number): MembershipType {
    if (days <= 1) return 'DAILY';
    if (days <= 45) return 'MONTHLY';
    if (days <= 120) return 'QUARTERLY';
    return 'ANNUAL';
  }

  // ------------------------------------------------------------------
  // MIG-B01/B02 — vista previa
  // ------------------------------------------------------------------

  private parseMapping(raw: string | undefined, fields: FieldDef[], columnCount: number): Mapping | null {
    if (!raw) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new BadRequestException('mapping no es un JSON válido'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException('mapping inválido');
    const keys = new Set(fields.map((f) => f.key));
    const mapping: Mapping = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!keys.has(key)) throw new BadRequestException(`Campo desconocido en el mapeo: ${key}`);
      if (value === null) { mapping[key] = null; continue; }
      if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= columnCount) {
        throw new BadRequestException(`Columna inválida para ${key}`);
      }
      mapping[key] = value as number;
    }
    for (const f of fields) mapping[f.key] ??= null;
    return mapping;
  }

  async preview(gymId: string, file: Express.Multer.File | undefined, dto: PreviewImportDto) {
    if (!file) throw new BadRequestException('Adjunta un archivo (.xlsx o .csv)');
    // multer decodifica el nombre como latin1: se reinterpreta como UTF-8 (tildes, ñ).
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255);
    const sheets = await readSpreadsheet(file.buffer, fileName);
    if (sheets.length === 0) throw new BadRequestException('El archivo no tiene hojas visibles');

    const sheet = pickSheet(dto.type, sheets, dto.sheet);
    const header = detectHeaderRow(dto.type, sheet);
    const headerRow = sheet.rows[header.index] ?? [];
    const columnCount = Math.max(headerRow.length, ...sheet.rows.slice(header.index, header.index + 50).map((r) => r?.length ?? 0));
    const fields = IMPORT_FIELDS[dto.type];
    const mapping = this.parseMapping(dto.mapping, fields, columnCount) ?? autoMap(dto.type, headerRow);

    // Filas completamente vacías no se muestran (Excel suele traer cientos).
    const dataRows = sheet.rows
      .map((cells, i) => ({ cells: cells ?? [], rowNumber: i + 1 }))
      .slice(header.index + 1)
      .filter((r) => r.cells.some((c) => c !== null && String(c).trim() !== ''));
    if (dataRows.length > MAX_ROWS) {
      throw new BadRequestException(`El archivo tiene más de ${MAX_ROWS} filas: divídelo en partes`);
    }

    const columns = Array.from({ length: columnCount }, (_, index) => ({
      index,
      header: cleanText(headerRow[index] ?? null, 80) ?? `Columna ${index + 1}`,
      samples: dataRows.slice(0, 40).map((r) => cleanText(r.cells[index] ?? null, 40)).filter(Boolean).slice(0, 3),
    }));

    const checks: FileChecks = { totals: null, summaryRows: [] };
    const rows = dto.type === 'MEMBERS_PAYMENTS'
      ? await this.previewMembers(gymId, dataRows, mapping, checks)
      : await this.previewAttendance(gymId, dataRows, mapping, headerRow, dto);

    const summary = { total: rows.length, NEW: 0, EXISTING: 0, DUPLICATE: 0, ERROR: 0, IGNORED: 0 } as Record<string, number>;
    for (const r of rows) summary[r.status]++;

    return {
      type: dto.type,
      fileName,
      sheets: sheets.map((s) => ({ name: s.name, rows: s.rows.length, score: detectHeaderRow(dto.type, s).score })),
      sheet: sheet.name,
      headerRow: header.index + 1,
      columns,
      fields: fields.map(({ key, label, required }) => ({ key, label, required: !!required })),
      mapping,
      summary,
      checks,
      rows,
    };
  }

  private cell(cells: Cell[], mapping: Mapping, key: string): Cell {
    const idx = mapping[key];
    return idx === null || idx === undefined ? null : cells[idx] ?? null;
  }

  private async previewMembers(
    gymId: string,
    dataRows: { cells: Cell[]; rowNumber: number }[],
    mapping: Mapping,
    checks: FileChecks,
  ): Promise<PreviewRow<MemberImportRowDto>[]> {
    if (mapping.fullName === null && mapping.firstName === null) {
      throw new BadRequestException('Falta la columna de nombre: asígnala en el mapeo de columnas');
    }
    const [index, plans, memberships] = await Promise.all([
      this.loadMemberIndex(gymId),
      this.loadPlans(gymId),
      this.prisma.membership.findMany({ where: { gymId }, select: { memberId: true, startDate: true } }),
    ]);
    const existingStarts = new Set(memberships.map((m) => `${m.memberId}|${this.ymdLocal(m.startDate)}`));
    const seenExternal = new Map<string, number>();
    const seenName = new Map<string, number>();
    const today = this.ymdLocal(new Date());
    let sumAmount = 0;
    let sumAmountBs = 0;
    let counted = 0;

    const result = dataRows.map(({ cells, rowNumber }): PreviewRow<MemberImportRowDto> => {
      const get = (key: string) => this.cell(cells, mapping, key);
      const errors: string[] = [];
      const warnings: string[] = [];

      // --- Identidad ---
      const externalId = cleanText(get('externalId'), 50);
      let firstName = cleanText(get('firstName'), 80);
      let lastName = cleanText(get('lastName'), 80);
      const fullName = cleanText(get('fullName'), 160);
      if (fullName && !firstName) ({ firstName, lastName } = splitFullName(fullName));
      const hasOtherData = [get('amount'), get('paymentDate'), get('email'), get('identificationNumber')]
        .some((v) => v !== null && v !== '');

      if (!firstName) {
        // Sin nombre NI ID = fila de resumen de la planilla (totales, gastos…),
        // no un socio: se informa y no se importa.
        if (!externalId) {
          const text = cells
            .map((c) => (typeof c === 'number'
              ? c.toLocaleString('es-VE', { maximumFractionDigits: 2 }) // 1407255.0199… → 1.407.255,02
              : cleanText(c, 60)))
            .filter(Boolean)
            .join(' · ');
          const amount = parseAmount(get('amount'));
          const amountBs = parseAmount(get('amountBs'));
          const label = cells.some((c) => typeof c === 'string' && /[a-z]/i.test(c));
          if (!label && (amount !== null || amountBs !== null) && !checks.totals) {
            checks.totals = {
              row: rowNumber,
              declaredAmount: amount,
              declaredAmountBs: amountBs,
              computedAmount: 0,
              computedAmountBs: 0,
              rowsCounted: 0,
              matches: false,
            };
          } else if (text) {
            checks.summaryRows.push({ row: rowNumber, text });
          }
          return {
            row: rowNumber,
            status: 'IGNORED',
            data: null,
            errors: [],
            warnings: text ? [`Fila de resumen de la planilla (${text}): no es un socio, no se importa`] : [],
          };
        }
        const empty = !hasOtherData;
        return {
          row: rowNumber,
          status: empty ? 'IGNORED' : 'ERROR',
          data: null,
          errors: empty ? [] : ['Falta el nombre del socio'],
          warnings: empty ? [`ID ${externalId} sin datos: fila ignorada`] : [],
        };
      }
      // Planillas escritas todo en MAYÚSCULAS o minúsculas → "Nombre Apellido".
      const fixCase = (s: string) => (s === s.toUpperCase() || s === s.toLowerCase() ? titleCase(s) : s);
      firstName = fixCase(firstName);
      lastName = lastName ? fixCase(lastName) : '';
      const displayName = `${firstName} ${lastName}`.trim();

      const rawId = get('identificationNumber');
      const identificationNumber = parseIdentification(rawId);
      if (rawId !== null && rawId !== '' && !identificationNumber) warnings.push('Cédula ilegible: se ignoró');
      const { email, invalid } = parseEmail(get('email'));
      if (invalid) errors.push(`Email inválido: "${cleanText(get('email'), 60)}"`);
      const phone = parsePhone(get('phone'));
      if (!email) warnings.push('Sin email: se asignará uno provisional (no recibirá correos)');

      // --- Pago / membresía ---
      const planName = cleanText(get('plan'), 80);
      const price = parseAmount(get('price'));
      const paymentStatus = parsePaymentStatus(get('paymentStatus'));
      const paymentDate = parseDate(get('paymentDate'));
      const dueDate = parseDate(get('dueDate'));
      let validDays = parseInteger(get('validDays'));
      const amount = parseAmount(get('amount'));
      const amountBs = parseAmount(get('amountBs'));
      const notes = cleanText(get('notes'), 500);
      counted++;
      sumAmount += amount ?? 0;
      sumAmountBs += amountBs ?? 0;

      if (amount !== null && amount < 0) errors.push('El monto no puede ser negativo');
      if (validDays !== null && (validDays < 1 || validDays > 3650)) { warnings.push('Días válidos fuera de rango: se ignoraron'); validDays = null; }
      if (paymentDate && dueDate) {
        const span = daysBetween(paymentDate, dueDate);
        if (span <= 0) warnings.push('El vencimiento es anterior al pago: se usarán los días válidos');
        else if (validDays && Math.abs(span - validDays) > 1) warnings.push(`El vencimiento no coincide con ${validDays} días: se usa la fecha de vencimiento`);
      }
      if (paymentDate && paymentDate > today) errors.push('La fecha de pago es futura');

      const plan = this.findPlan(plans, planName);
      const willPay = paymentStatus !== 'PENDING' && !!paymentDate;
      if (paymentStatus === 'PENDING') warnings.push('Pago pendiente: se importa el socio sin membresía ni ingreso');
      else if (!paymentDate) warnings.push('Sin fecha de pago válida: se importa solo el socio');
      if (willPay && planName && !plan) warnings.push(`El plan "${planName}" no existe: se creará si la opción está activa`);
      if (willPay && !planName && !plans.length) errors.push('No hay planes creados y la fila no indica plan');
      else if (willPay && !planName && plans.length > 1) warnings.push('La fila no indica plan: se importa solo el socio');
      if (willPay && (amount === null || amount === 0)) warnings.push('Sin monto: se crea la membresía sin registrar ingreso');

      const data: MemberImportRowDto = {
        row: rowNumber,
        ...(externalId ? { externalId } : {}),
        firstName,
        lastName,
        ...(identificationNumber ? { identificationNumber } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(planName ? { planName } : {}),
        ...(price !== null && price >= 0 ? { price } : {}),
        ...(paymentDate ? { paymentDate } : {}),
        ...(validDays ? { validDays } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(amount !== null && amount >= 0 ? { amount } : {}),
        ...(amountBs !== null && amountBs >= 0 ? { amountBs } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
        ...(notes ? { notes } : {}),
      };

      // --- Duplicados dentro del archivo ---
      const nameKey = normalizeKey(displayName);
      const dupOf = (externalId && seenExternal.get(externalId.toLowerCase())) || (!externalId && seenName.get(nameKey));
      if (externalId) seenExternal.set(externalId.toLowerCase(), seenExternal.get(externalId.toLowerCase()) ?? rowNumber);
      seenName.set(nameKey, seenName.get(nameKey) ?? rowNumber);
      if (dupOf && dupOf !== rowNumber) {
        return { row: rowNumber, status: 'DUPLICATE', data, errors: [], warnings: [`Duplicado de la fila ${dupOf}: se omitirá`] };
      }

      // --- Duplicados contra la base ---
      const found = this.findMember(index, { externalId, identificationNumber, email, name: displayName });
      if (found.ambiguous) warnings.push('Hay varios socios con este nombre: se creará uno nuevo (agrega el ID o la cédula para vincularlo)');
      if (found.entry) {
        if (found.by === 'nombre') warnings.push(`Coincide por nombre con "${found.entry.name}": se vinculará a ese socio`);
        if (willPay && existingStarts.has(`${found.entry.id}|${paymentDate}`)) {
          warnings.push('Este pago ya estaba importado: se omitirá');
        }
      }

      return {
        row: rowNumber,
        status: errors.length ? 'ERROR' : found.entry ? 'EXISTING' : 'NEW',
        data,
        errors,
        warnings,
        match: found.entry ? { memberId: found.entry.id, name: found.entry.name, by: found.by } : null,
      };
    });

    // Compara el total que declara la planilla con la suma real de las filas
    // (tolerancia de medio centavo por redondeos de Excel).
    if (checks.totals) {
      const round = (n: number) => Math.round(n * 100) / 100;
      const t = checks.totals;
      t.computedAmount = round(sumAmount);
      t.computedAmountBs = round(sumAmountBs);
      t.rowsCounted = counted;
      t.matches = (t.declaredAmount === null || Math.abs(t.declaredAmount - t.computedAmount) < 0.005)
        && (t.declaredAmountBs === null || Math.abs(t.declaredAmountBs - t.computedAmountBs) < 0.005);
    }
    return result;
  }

  private async previewAttendance(
    gymId: string,
    dataRows: { cells: Cell[]; rowNumber: number }[],
    mapping: Mapping,
    headerRow: Cell[],
    dto: PreviewImportDto,
  ): Promise<PreviewRow<AttendanceImportRowDto>[]> {
    if (!dto.year || !dto.month) {
      throw new BadRequestException('Indica el mes y el año de la planilla de asistencia');
    }
    if (mapping.externalId === null && mapping.fullName === null) {
      throw new BadRequestException('Falta la columna de ID o de nombre: asígnala en el mapeo de columnas');
    }
    const dayColumns = headerRow
      .map((h, index) => ({ index, day: dayOfHeader(cleanText(h)) }))
      .filter((c): c is { index: number; day: number } => c.day !== null);
    if (!dayColumns.length) throw new BadRequestException('No se encontraron columnas "Día 1" … "Día 31"');

    const { year, month } = dto;
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = this.ymdLocal(new Date());
    const index = await this.loadMemberIndex(gymId);
    const monthStart = localDate(`${year}-${String(month).padStart(2, '0')}-01`);
    const monthEnd = new Date(year, month, 1);
    const existing = await this.prisma.attendance.findMany({
      where: { gymId, checkedInAt: { gte: monthStart, lt: monthEnd } },
      select: { memberId: true, checkedInAt: true },
    });
    const existingDays = new Set(existing.map((a) => `${a.memberId}|${this.ymdLocal(a.checkedInAt)}`));
    const seen = new Map<string, number>();

    return dataRows.map(({ cells, rowNumber }) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const externalId = cleanText(this.cell(cells, mapping, 'externalId'), 50);
      const fullName = cleanText(this.cell(cells, mapping, 'fullName'), 160);
      const dates: string[] = [];
      for (const { index: col, day } of dayColumns) {
        const mark = isAttendanceMark(cells[col] ?? null);
        if (mark === null) { warnings.push(`Día ${day}: valor "${cleanText(cells[col] ?? null, 10)}" no reconocido, se ignoró`); continue; }
        if (!mark) continue;
        if (day > daysInMonth) { errors.push(`Día ${day} no existe en ${month}/${year}`); continue; }
        const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (ymd > today) { errors.push(`Día ${day}: fecha futura`); continue; }
        dates.push(ymd);
      }

      if (!externalId && !fullName) {
        return { row: rowNumber, status: 'IGNORED', data: null, errors: [], warnings: [] };
      }
      const data: AttendanceImportRowDto = {
        row: rowNumber,
        ...(externalId ? { externalId } : {}),
        ...(fullName ? { fullName } : {}),
        dates,
      };
      if (!dates.length && !errors.length) {
        return { row: rowNumber, status: 'IGNORED', data, errors: [], warnings: ['Sin asistencias marcadas'] };
      }

      const key = (externalId ?? normalizeKey(fullName)).toLowerCase();
      const dupOf = seen.get(key);
      seen.set(key, dupOf ?? rowNumber);
      if (dupOf) return { row: rowNumber, status: 'DUPLICATE', data, errors: [], warnings: [`Duplicado de la fila ${dupOf}: se omitirá`] };

      const found = this.findMember(index, { externalId, name: fullName });
      if (!found.entry) {
        errors.push(found.ambiguous
          ? `Hay varios socios llamados "${fullName}": usa la columna ID`
          : `Socio no encontrado (${[externalId && `ID ${externalId}`, fullName].filter(Boolean).join(' / ')}). Importa primero los socios.`);
      } else {
        // ID que coincide con OTRA persona (ninguna palabra del nombre en común):
        // la hoja es de otra numeración o trae datos de ejemplo → no se importa,
        // para no cargarle asistencias falsas a un socio real.
        if (found.by === 'ID' && fullName && normalizeKey(fullName) !== normalizeKey(found.entry.name)) {
          const words = new Set(normalizeKey(found.entry.name).split(' '));
          const shared = normalizeKey(fullName).split(' ').some((w) => w.length > 2 && words.has(w));
          (shared ? warnings : errors).push(
            `El ID ${externalId} pertenece a "${found.entry.name}", no a "${fullName}": revisa la planilla`,
          );
        }
        const already = dates.filter((d) => existingDays.has(`${found.entry!.id}|${d}`)).length;
        if (already) warnings.push(`${already} día(s) ya registrados: se omitirán`);
      }

      return {
        row: rowNumber,
        status: errors.length ? 'ERROR' : 'EXISTING',
        data,
        errors,
        warnings,
        match: found.entry ? { memberId: found.entry.id, name: found.entry.name, by: found.by } : null,
      };
    });
  }

  // ------------------------------------------------------------------
  // MIG-B01 — ejecución por lotes (con progreso real en el cliente)
  // ------------------------------------------------------------------

  createJob(gymId: string, dto: CreateImportJobDto, userId?: string) {
    return this.prisma.importJob.create({
      data: { gymId, type: dto.type, fileName: dto.fileName, totalRows: dto.totalRows, createdById: userId },
    });
  }

  private async runningJob(gymId: string, jobId: string, type: ImportType) {
    const job = await this.prisma.importJob.findFirst({ where: { id: jobId, gymId } });
    if (!job) throw new NotFoundException('Importación no encontrada');
    if (job.type !== type) throw new BadRequestException('El lote no corresponde al tipo de importación');
    if (job.status !== 'RUNNING') throw new ConflictException('La importación ya terminó');
    return job;
  }

  // Suma contadores y guarda las filas con problemas en el historial.
  private async recordBatch(jobId: string, results: CommitResult[]) {
    const job = await this.prisma.importJob.findUniqueOrThrow({ where: { id: jobId }, select: { issues: true } });
    const issues = Array.isArray(job.issues) ? (job.issues as CommitResult[]) : [];
    const newIssues = results.filter((r) => r.status === 'FAILED' || r.status === 'SKIPPED');
    const count = (s: CommitStatus) => results.filter((r) => r.status === s).length;
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        processed: { increment: results.length },
        created: { increment: count('CREATED') },
        updated: { increment: count('UPDATED') },
        skipped: { increment: count('SKIPPED') },
        failed: { increment: count('FAILED') },
        issues: [...issues, ...newIssues].slice(0, MAX_ISSUES) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private placeholder(prefix: string, seed?: string | null): string {
    const clean = (seed ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    return clean ? `${prefix}${clean}` : `${prefix}${randomBytes(4).toString('hex')}`;
  }

  async importMembersBatch(
    gymId: string,
    jobId: string,
    rows: MemberImportRowDto[],
    options: MembersImportOptionsDto,
  ) {
    await this.runningJob(gymId, jobId, 'MEMBERS_PAYMENTS');
    const index = await this.loadMemberIndex(gymId);
    const plans = await this.loadPlans(gymId);
    const results: CommitResult[] = [];

    // Si hay que crear un plan, su precio es la tarifa MÁS FRECUENTE del lote
    // para ese plan (no la de la primera fila, que puede ser un caso especial).
    const tallies = new Map<string, Map<number, number>>();
    for (const r of rows) {
      const fee = r.price ?? r.amount;
      if (!r.planName || fee === undefined) continue;
      const key = normalizeKey(r.planName);
      const t = tallies.get(key) ?? new Map<number, number>();
      t.set(fee, (t.get(fee) ?? 0) + 1);
      tallies.set(key, t);
    }
    const priceHints = new Map([...tallies].map(([key, t]) => [key, [...t].sort((a, b) => b[1] - a[1])[0][0]]));

    for (const row of rows) {
      try {
        results.push(await this.importMemberRow(gymId, row, options, index, plans, priceHints));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ row: row.row, status: 'FAILED', message });
      }
    }
    await this.recordBatch(jobId, results);
    return { results };
  }

  private async importMemberRow(
    gymId: string,
    row: MemberImportRowDto,
    options: MembersImportOptionsDto,
    index: MemberIndex,
    plans: PlanRow[],
    priceHints: Map<string, number>,
  ): Promise<CommitResult> {
    const name = `${row.firstName} ${row.lastName}`.trim();
    const found = this.findMember(index, {
      externalId: row.externalId,
      identificationNumber: row.identificationNumber,
      email: row.email,
      name,
    });
    const parts: string[] = [];
    let status: CommitStatus = 'SKIPPED';
    let memberId: string;

    if (!found.entry) {
      // Socio nuevo. Sin email/cédula se usan valores provisionales únicos
      // (dominio .invalid: nunca recibe correos) que el staff completa luego.
      let email = row.email ?? `${this.placeholder('socio-', row.externalId)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
      let identificationNumber = row.identificationNumber ?? this.placeholder(PLACEHOLDER_ID_PREFIX, row.externalId).toUpperCase();
      if (!row.email && index.byEmail.has(email)) email = `${this.placeholder('socio-')}@${PLACEHOLDER_EMAIL_DOMAIN}`;
      if (!row.identificationNumber && index.byIdNumber.has(identificationNumber)) {
        identificationNumber = this.placeholder(PLACEHOLDER_ID_PREFIX).toUpperCase();
      }
      const externalId = row.externalId && !index.byExternal.has(row.externalId.toLowerCase()) ? row.externalId : undefined;

      const created = await this.members.create(gymId, {
        firstName: row.firstName,
        lastName: row.lastName,
        email,
        password: randomBytes(18).toString('base64url'), // debe restablecerla
        phone: row.phone,
        identificationNumber,
        externalId,
      });
      memberId = created.id;
      this.addToIndex(index, { id: memberId, name, externalId: externalId ?? null, identificationNumber, email });
      status = 'CREATED';
      parts.push('Socio creado');
    } else {
      memberId = found.entry.id;
      parts.push(`Socio existente (por ${found.by})`);
      if (options.updateExisting) {
        const changes = await this.fillMissing(gymId, found.entry, row, index);
        if (changes.length) { status = 'UPDATED'; parts.push(`actualizado: ${changes.join(', ')}`); }
      }
    }

    // --- Membresía + ingreso ---
    if (row.paymentStatus === 'PENDING') {
      parts.push('pago pendiente (sin membresía)');
    } else if (!row.paymentDate) {
      parts.push('sin fecha de pago (sin membresía)');
    } else {
      const paid = await this.importPayment(gymId, memberId, row, options, plans, priceHints);
      parts.push(paid.message);
      if (paid.created && status === 'SKIPPED') status = 'UPDATED';
    }

    return { row: row.row, status, message: parts.join(' · ') };
  }

  // Completa SOLO datos vacíos o provisionales; nunca pisa datos reales.
  private async fillMissing(gymId: string, entry: MemberIndexEntry, row: MemberImportRowDto, index: MemberIndex) {
    const changes: string[] = [];
    const memberData: Prisma.MemberUpdateInput = {};
    const userData: Prisma.UserUpdateInput = {};

    if (row.externalId && !entry.externalId && !index.byExternal.has(row.externalId.toLowerCase())) {
      memberData.externalId = row.externalId;
      changes.push('ID');
    }
    if (row.identificationNumber && entry.identificationNumber.startsWith(PLACEHOLDER_ID_PREFIX)
      && !index.byIdNumber.has(row.identificationNumber.toUpperCase())) {
      memberData.identificationNumber = row.identificationNumber;
      changes.push('cédula');
    }
    if (row.email && entry.email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`) && !index.byEmail.has(row.email)) {
      userData.email = row.email;
      changes.push('email');
    }
    if (!changes.length && !row.phone) return changes;

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(memberData).length) await tx.member.update({ where: { id: entry.id }, data: memberData });
      const member = await tx.member.findFirstOrThrow({ where: { id: entry.id, gymId }, select: { userId: true } });
      if (Object.keys(userData).length) await tx.user.update({ where: { id: member.userId }, data: userData });
      if (row.phone) {
        const { count } = await tx.profile.updateMany({ where: { userId: member.userId, gymId, phone: null }, data: { phone: row.phone } });
        if (count) changes.push('teléfono');
      }
    });
    if (memberData.externalId) entry.externalId = row.externalId!;
    return changes;
  }

  private async importPayment(
    gymId: string,
    memberId: string,
    row: MemberImportRowDto,
    options: MembersImportOptionsDto,
    plans: PlanRow[],
    priceHints: Map<string, number>,
  ): Promise<{ created: boolean; message: string }> {
    let plan = this.findPlan(plans, row.planName) ?? (!row.planName && plans.length === 1 ? plans[0] : null);
    if (!plan) {
      if (!row.planName) return { created: false, message: 'sin plan indicado (sin membresía)' };
      if (!options.createMissingPlans) return { created: false, message: `plan "${row.planName}" inexistente (sin membresía)` };
      const days = row.validDays ?? (row.dueDate ? daysBetween(row.paymentDate!, row.dueDate) : 30);
      const createdPlan = await this.prisma.membershipPlan.create({
        data: {
          gymId,
          name: titleCase(row.planName),
          type: this.inferPlanType(days),
          price: priceHints.get(normalizeKey(row.planName)) ?? row.price ?? row.amount ?? 0,
          currency: 'USD',
          durationDays: Math.max(1, days),
        },
        select: { id: true, name: true, type: true, durationDays: true, price: true },
      });
      plans.push(createdPlan);
      plan = createdPlan;
    }

    const start = row.paymentDate!;
    const span = row.dueDate ? daysBetween(start, row.dueDate) : 0;
    const end = span > 0 ? row.dueDate! : addDays(start, row.validDays ?? plan.durationDays);
    const startDate = localDate(start);

    // Idempotencia: el mismo socio con una membresía que empieza ese día = ya importado.
    const dayEnd = new Date(startDate.getTime() + 86_400_000);
    const exists = await this.prisma.membership.findFirst({
      where: { gymId, memberId, startDate: { gte: startDate, lt: dayEnd } },
      select: { id: true },
    });
    if (exists) return { created: false, message: 'pago ya importado (omitido)' };

    const noteParts = ['Importado', row.notes, row.amountBs ? `Pagado Bs ${row.amountBs.toLocaleString('es-VE')}` : null];
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.create({
        data: { gymId, memberId, planId: plan!.id, startDate, endDate: localDate(end, 23) },
      });
      if (row.amount && row.amount > 0) {
        await this.finances.create(gymId, {
          type: 'INCOME',
          amount: row.amount,
          currency: 'USD',
          memberId,
          note: noteParts.filter(Boolean).join(' · ').slice(0, 500),
          date: startDate.toISOString(),
        }, tx);
      }
    });
    const fmt = (s: string) => s.split('-').reverse().join('/');
    return {
      created: true,
      message: `membresía ${plan.name} ${fmt(start)}–${fmt(end)}${row.amount ? ` · ingreso $${row.amount}` : ''}`,
    };
  }

  async importAttendanceBatch(gymId: string, jobId: string, rows: AttendanceImportRowDto[]) {
    await this.runningJob(gymId, jobId, 'ATTENDANCE');
    const index = await this.loadMemberIndex(gymId);
    const today = this.ymdLocal(new Date());
    const results: CommitResult[] = [];

    for (const row of rows) {
      try {
        const found = this.findMember(index, { externalId: row.externalId, name: row.fullName });
        if (!found.entry) {
          results.push({ row: row.row, status: 'FAILED', message: 'Socio no encontrado' });
          continue;
        }
        // Misma regla que la vista previa: ID de otra persona → no se importa.
        if (found.by === 'ID' && row.fullName && normalizeKey(row.fullName) !== normalizeKey(found.entry.name)) {
          const words = new Set(normalizeKey(found.entry.name).split(' '));
          if (!normalizeKey(row.fullName).split(' ').some((w) => w.length > 2 && words.has(w))) {
            results.push({ row: row.row, status: 'FAILED', message: `El ID ${row.externalId} pertenece a "${found.entry.name}", no a "${row.fullName}"` });
            continue;
          }
        }
        const dates = [...new Set(row.dates)].filter((d) => d <= today);
        if (!dates.length) {
          results.push({ row: row.row, status: 'SKIPPED', message: 'Sin fechas válidas' });
          continue;
        }
        const from = localDate(dates.reduce((a, b) => (a < b ? a : b)));
        const to = new Date(localDate(dates.reduce((a, b) => (a > b ? a : b))).getTime() + 86_400_000);
        const existing = await this.prisma.attendance.findMany({
          where: { gymId, memberId: found.entry.id, checkedInAt: { gte: from, lt: to } },
          select: { checkedInAt: true },
        });
        const already = new Set(existing.map((a) => this.ymdLocal(a.checkedInAt)));
        const toCreate = dates.filter((d) => !already.has(d));
        if (toCreate.length) {
          // Hora desconocida en la planilla: se registra a las 8:00 (turno mañana).
          await this.prisma.attendance.createMany({
            data: toCreate.map((d) => ({ gymId, memberId: found.entry!.id, checkedInAt: localDate(d, 8), shift: 'MORNING' as const })),
          });
        }
        results.push({
          row: row.row,
          status: toCreate.length ? 'CREATED' : 'SKIPPED',
          message: `${found.entry.name}: ${toCreate.length} asistencia(s) nuevas${already.size ? `, ${dates.length - toCreate.length} ya existían` : ''}`,
        });
      } catch (err) {
        results.push({ row: row.row, status: 'FAILED', message: err instanceof Error ? err.message : String(err) });
      }
    }
    await this.recordBatch(jobId, results);
    return { results };
  }

  async finishJob(gymId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({ where: { id: jobId, gymId } });
    if (!job) throw new NotFoundException('Importación no encontrada');
    if (job.status !== 'RUNNING') return job;
    return this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED', finishedAt: new Date() },
    });
  }

  listJobs(gymId: string) {
    return this.prisma.importJob.findMany({
      where: { gymId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: {
        id: true, type: true, fileName: true, status: true, totalRows: true, processed: true,
        created: true, updated: true, skipped: true, failed: true, startedAt: true, finishedAt: true,
      },
    });
  }

  async getJob(gymId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({ where: { id: jobId, gymId } });
    if (!job) throw new NotFoundException('Importación no encontrada');
    return job;
  }

  private ymdLocal(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
