import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { ExportColumn, toCsv, toXlsx } from './file-writers';
import { ExportQueryDto, ExportResource } from './dto/export-query.dto';

// Tope de filas por archivo: por encima, conviene acotar el rango de fechas.
const MAX_EXPORT_ROWS = 20_000;
const DATE_FMT = 'dd/mm/yyyy';
const DATETIME_FMT = 'dd/mm/yyyy hh:mm';
const MONEY_FMT = '#,##0.00';

const SHIFT_LABELS: Record<string, string> = { MORNING: 'Mañana', AFTERNOON: 'Tarde', NIGHT: 'Noche' };
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Activo', INACTIVE: 'Inactivo', SUSPENDED: 'Suspendido' };

type ExportFile = { buffer: Buffer; fileName: string; contentType: string; rows: number };

@Injectable()
export class ExportsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  // "YYYY-MM-DD" → rango local [00:00 de from, 23:59:59.999 de to].
  private range(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) return undefined;
    const parse = (s: string, end: boolean) => {
      const [y, m, d] = s.split('-').map(Number);
      return end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
    };
    const r = { ...(from ? { gte: parse(from, false) } : {}), ...(to ? { lte: parse(to, true) } : {}) };
    if (r.gte && r.lte && r.gte > r.lte) throw new BadRequestException('La fecha "desde" es posterior a "hasta"');
    return r;
  }

  private assertSize(count: number) {
    if (count > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `La exportación tiene ${count} filas (máximo ${MAX_EXPORT_ROWS}). Acota el rango de fechas o los filtros.`,
      );
    }
  }

  private fullName(profile?: { firstName?: string | null; lastName?: string | null } | null) {
    return `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
  }

  // Los emails provisionales de socios importados no se exportan como reales.
  private realEmail(email: string) {
    return email.endsWith('.invalid') ? '' : email;
  }

  async export(gymId: string, resource: ExportResource, query: ExportQueryDto): Promise<ExportFile> {
    const format = query.format ?? 'xlsx';
    const stamp = new Date().toISOString().slice(0, 10);
    const build = async <T>(name: string, sheet: string, columns: ExportColumn<T>[], rows: T[]): Promise<ExportFile> => ({
      buffer: format === 'csv' ? toCsv(columns, rows) : await toXlsx(sheet, columns, rows),
      fileName: `${name}_${stamp}.${format}`,
      contentType: format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rows: rows.length,
    });

    if (resource === 'members') {
      const rows = await this.members(gymId, query);
      return build('socios', 'Socios', this.memberColumns, rows);
    }
    if (resource === 'attendance') {
      const rows = await this.attendance(gymId, query);
      return build('asistencia', 'Asistencia', this.attendanceColumns, rows);
    }
    const rows = await this.finances(gymId, query);
    return build('finanzas', 'Finanzas', this.financeColumns, rows);
  }

  // ------------------------------------------------------------------
  // Socios
  // ------------------------------------------------------------------

  private async members(gymId: string, query: ExportQueryDto) {
    const q = query.q?.trim();
    const where: Prisma.MemberWhereInput = {
      gymId,
      ...(query.status ? { status: query.status } : {}),
      ...(this.range(query.from, query.to) ? { joinedAt: this.range(query.from, query.to) } : {}),
      ...(q ? {
        OR: [
          { identificationNumber: { contains: q, mode: 'insensitive' } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { user: { profile: { firstName: { contains: q, mode: 'insensitive' } } } },
          { user: { profile: { lastName: { contains: q, mode: 'insensitive' } } } },
        ],
      } : {}),
    };
    this.assertSize(await this.prisma.member.count({ where }));
    return this.prisma.member.findMany({
      where,
      orderBy: [{ joinedAt: 'asc' }],
      select: {
        externalId: true,
        identificationNumber: true,
        status: true,
        joinedAt: true,
        pointsBalance: true,
        user: { select: { email: true, profile: { select: { firstName: true, lastName: true, phone: true } } } },
        memberships: {
          orderBy: { endDate: 'desc' },
          take: 1,
          select: { startDate: true, endDate: true, plan: { select: { name: true } } },
        },
      },
    });
  }

  private readonly memberColumns: ExportColumn<Awaited<ReturnType<ExportsService['members']>>[number]>[] = [
    { header: 'ID', value: (m) => m.externalId ?? '', width: 10 },
    { header: 'Nombre', value: (m) => m.user.profile?.firstName ?? '', width: 20 },
    { header: 'Apellido', value: (m) => m.user.profile?.lastName ?? '', width: 20 },
    { header: 'Cédula', value: (m) => (m.identificationNumber.startsWith('SINCI') ? '' : m.identificationNumber), width: 14 },
    { header: 'Email', value: (m) => this.realEmail(m.user.email), width: 28 },
    { header: 'Teléfono', value: (m) => m.user.profile?.phone ?? '', width: 16 },
    { header: 'Estado', value: (m) => STATUS_LABELS[m.status] ?? m.status, width: 12 },
    { header: 'Fecha de alta', value: (m) => m.joinedAt, numFmt: DATE_FMT, width: 14 },
    { header: 'Plan', value: (m) => m.memberships[0]?.plan.name ?? '', width: 16 },
    { header: 'Inicio membresía', value: (m) => m.memberships[0]?.startDate ?? null, numFmt: DATE_FMT, width: 16 },
    { header: 'Vencimiento', value: (m) => m.memberships[0]?.endDate ?? null, numFmt: DATE_FMT, width: 14 },
    { header: 'Puntos', value: (m) => m.pointsBalance, width: 10 },
  ];

  // ------------------------------------------------------------------
  // Asistencia
  // ------------------------------------------------------------------

  private async attendance(gymId: string, query: ExportQueryDto) {
    const range = this.range(query.from, query.to);
    const where: Prisma.AttendanceWhereInput = {
      gymId,
      ...(range ? { checkedInAt: range } : {}),
      ...(query.shift ? { shift: query.shift } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
    };
    this.assertSize(await this.prisma.attendance.count({ where }));
    return this.prisma.attendance.findMany({
      where,
      orderBy: { checkedInAt: 'asc' },
      select: {
        checkedInAt: true,
        shift: true,
        member: {
          select: {
            externalId: true,
            identificationNumber: true,
            user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });
  }

  private readonly attendanceColumns: ExportColumn<Awaited<ReturnType<ExportsService['attendance']>>[number]>[] = [
    { header: 'Fecha y hora', value: (a) => a.checkedInAt, numFmt: DATETIME_FMT, width: 18 },
    { header: 'Turno', value: (a) => SHIFT_LABELS[a.shift] ?? a.shift, width: 10 },
    { header: 'ID socio', value: (a) => a.member.externalId ?? '', width: 10 },
    { header: 'Socio', value: (a) => this.fullName(a.member.user.profile), width: 26 },
    { header: 'Cédula', value: (a) => (a.member.identificationNumber.startsWith('SINCI') ? '' : a.member.identificationNumber), width: 14 },
  ];

  // ------------------------------------------------------------------
  // Finanzas
  // ------------------------------------------------------------------

  private async finances(gymId: string, query: ExportQueryDto) {
    const range = this.range(query.from, query.to);
    const where: Prisma.TransactionWhereInput = {
      gymId,
      ...(range ? { date: range } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.conceptId ? { conceptId: query.conceptId } : {}),
    };
    this.assertSize(await this.prisma.transaction.count({ where }));
    return this.prisma.transaction.findMany({
      where,
      orderBy: { date: 'asc' },
      select: {
        date: true,
        type: true,
        amount: true,
        currency: true,
        exchangeRate: true,
        amountBase: true,
        paymentMethod: true,
        note: true,
        concept: { select: { name: true } },
        member: { select: { user: { select: { profile: { select: { firstName: true, lastName: true } } } } } },
      },
    });
  }

  private readonly financeColumns: ExportColumn<Awaited<ReturnType<ExportsService['finances']>>[number]>[] = [
    { header: 'Fecha', value: (t) => t.date, numFmt: DATE_FMT, width: 12 },
    { header: 'Tipo', value: (t) => (t.type === 'INCOME' ? 'Ingreso' : 'Egreso'), width: 10 },
    { header: 'Concepto', value: (t) => t.concept?.name ?? '', width: 20 },
    { header: 'Socio', value: (t) => this.fullName(t.member?.user.profile), width: 24 },
    { header: 'Monto', value: (t) => Number(t.amount), numFmt: MONEY_FMT, width: 12 },
    { header: 'Moneda', value: (t) => t.currency, width: 8 },
    { header: 'Tasa', value: (t) => Number(t.exchangeRate), numFmt: '#,##0.0000', width: 12 },
    { header: 'Monto (moneda base)', value: (t) => Number(t.amountBase), numFmt: MONEY_FMT, width: 18 },
    { header: 'Método de pago', value: (t) => t.paymentMethod ?? '', width: 14 },
    { header: 'Nota', value: (t) => t.note ?? '', width: 40 },
  ];
}
