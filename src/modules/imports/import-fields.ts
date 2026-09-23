import { ImportType } from '@prisma/client';
import type { Cell, Sheet } from './spreadsheet';
import { cleanText, normalizeKey } from './normalize';

export type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  // Encabezados que se reconocen automáticamente (se comparan normalizados).
  synonyms: string[];
};

// MIG-B02 — mapeo de columnas. El usuario puede corregirlo en la vista previa.
export const IMPORT_FIELDS: Record<ImportType, FieldDef[]> = {
  MEMBERS_PAYMENTS: [
    { key: 'externalId', label: 'ID / Nº de socio', synonyms: ['id', 'codigo', 'nro', 'numero', 'n socio', 'numero de socio', 'id socio', 'id cliente'] },
    { key: 'fullName', label: 'Nombre completo', synonyms: ['nombre del cliente', 'nombre completo', 'cliente', 'socio', 'nombre y apellido', 'nombres y apellidos'] },
    { key: 'firstName', label: 'Nombre', synonyms: ['nombre', 'nombres', 'primer nombre'] },
    { key: 'lastName', label: 'Apellido', synonyms: ['apellido', 'apellidos'] },
    { key: 'identificationNumber', label: 'Cédula / documento', synonyms: ['cedula', 'ci', 'c i', 'documento', 'dni', 'identificacion', 'rif'] },
    { key: 'email', label: 'Email', synonyms: ['email', 'correo', 'correo electronico', 'e mail', 'mail'] },
    { key: 'phone', label: 'Teléfono', synonyms: ['telefono', 'celular', 'movil', 'tlf', 'whatsapp'] },
    { key: 'plan', label: 'Plan', synonyms: ['tipo de plan', 'plan', 'membresia', 'tipo de membresia'] },
    { key: 'price', label: 'Tarifa', synonyms: ['tarifa', 'precio', 'tarifa', 'costo del plan'] },
    { key: 'paymentDate', label: 'Fecha de pago', synonyms: ['ultima fecha de pago', 'fecha de pago', 'fecha pago', 'fecha', 'inicio', 'fecha de inicio'] },
    { key: 'validDays', label: 'Días válidos', synonyms: ['dias validos', 'dias', 'duracion', 'dias de vigencia'] },
    { key: 'dueDate', label: 'Fecha de vencimiento', synonyms: ['fecha de vencimiento', 'vencimiento', 'vence', 'fecha fin'] },
    { key: 'amount', label: 'Monto pagado ($)', synonyms: ['monto pagado', 'monto', 'pagado', 'monto usd', 'monto $'] },
    { key: 'amountBs', label: 'Monto en Bs', synonyms: ['monto bs', 'bs', 'bolivares', 'monto en bs', 'monto bolivares'] },
    { key: 'paymentStatus', label: 'Estado de pago', synonyms: ['estado de pago', 'estado', 'pago', 'estatus'] },
    { key: 'notes', label: 'Notas', synonyms: ['notas', 'nota', 'observaciones', 'comentarios'] },
  ],
  ATTENDANCE: [
    { key: 'externalId', label: 'ID / Nº de socio', synonyms: ['id', 'codigo', 'nro', 'numero', 'numero de socio', 'id socio', 'id cliente'] },
    { key: 'fullName', label: 'Nombre completo', synonyms: ['nombre del cliente', 'nombre completo', 'cliente', 'socio', 'nombre'] },
    { key: 'plan', label: 'Plan', synonyms: ['tipo de plan', 'plan'] },
  ],
};

// Columnas de la cuadrícula de asistencia: "Día 1" … "Día 31" (o "1".."31").
const DAY_HEADER_RE = /^(?:dia\s*)?(\d{1,2})$/;

export function dayOfHeader(header: string | null): number | null {
  const match = DAY_HEADER_RE.exec(normalizeKey(header));
  if (!match) return null;
  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

export type Mapping = Record<string, number | null>;

function headerTexts(row: Cell[]): string[] {
  return row.map((c) => normalizeKey(cleanText(c)));
}

// Asigna cada campo a una columna: primero coincidencias exactas (en orden de
// sinónimos), luego parciales; una columna se usa una sola vez.
export function autoMap(type: ImportType, headerRow: Cell[]): Mapping {
  const headers = headerTexts(headerRow);
  const used = new Set<number>();
  const mapping: Mapping = {};
  const fields = IMPORT_FIELDS[type];

  for (const pass of ['exact', 'partial'] as const) {
    for (const field of fields) {
      if (mapping[field.key] !== undefined && mapping[field.key] !== null) continue;
      for (const synonym of field.synonyms) {
        const idx = headers.findIndex((h, i) =>
          !used.has(i) && h && (pass === 'exact' ? h === synonym : h.startsWith(synonym) || h.includes(` ${synonym}`)));
        if (idx !== -1) { mapping[field.key] = idx; used.add(idx); break; }
      }
      mapping[field.key] ??= null;
    }
  }

  // Si hay columna de nombre completo, "Nombre" suelto no es un campo aparte.
  if (mapping.fullName !== null && mapping.firstName !== null && mapping.lastName === null) {
    mapping.firstName = null;
  }
  return mapping;
}

// Puntaje de una fila como encabezado: cuántas celdas coinciden con algún
// sinónimo (o con "Día N" en asistencia).
function headerScore(type: ImportType, row: Cell[]): number {
  const synonyms = new Set(IMPORT_FIELDS[type].flatMap((f) => f.synonyms));
  let score = 0;
  for (const text of headerTexts(row)) {
    if (!text) continue;
    if (synonyms.has(text)) score += 2;
    else if (type === 'ATTENDANCE' && dayOfHeader(text) !== null) score += 1;
    else if ([...synonyms].some((s) => s.length > 3 && text.includes(s))) score += 1;
  }
  return score;
}

// Busca la fila de encabezados en las primeras 15 (hay planillas con títulos
// arriba, como "PLAN VENCIDO").
export function detectHeaderRow(type: ImportType, sheet: Sheet): { index: number; score: number } {
  let best = { index: 0, score: -1 };
  sheet.rows.slice(0, 15).forEach((row, index) => {
    const score = headerScore(type, row ?? []);
    if (score > best.score) best = { index, score };
  });
  return best;
}

// Elige la hoja que mejor encaja con el tipo de importación.
export function pickSheet(type: ImportType, sheets: Sheet[], requested?: string) {
  if (requested) {
    const sheet = sheets.find((s) => s.name === requested);
    if (sheet) return sheet;
  }
  return [...sheets].sort((a, b) => detectHeaderRow(type, b).score - detectHeaderRow(type, a).score)[0];
}
