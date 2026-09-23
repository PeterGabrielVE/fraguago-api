import type { Cell } from './spreadsheet';

// MIG-B02 — sanitización y normalización de celdas importadas.

// Texto limpio: sin caracteres de control ni espacios de más, recortado.
export function cleanText(value: Cell, maxLength = 200): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && Number.isNaN(value.getTime())) return null;
  const text = (value instanceof Date ? value.toISOString().slice(0, 10) : String(value))
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

// Clave de comparación: minúsculas, sin tildes ni signos (para mapear columnas
// y detectar nombres duplicados escritos distinto: "José  Pérez" = "jose perez").
export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// "maría  josé" → "María José" (respeta partículas: de, del, la).
export function titleCase(value: string): string {
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  return value
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && particles.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// Separa "Nombre completo" en nombre y apellido. Heurística para nombres
// hispanos: 2 palabras → 1+1; 3 → 1 + 2 apellidos; 4+ → 2 nombres + resto.
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.split(' ').filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  if (parts.length === 3) return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  return { firstName: parts.slice(0, 2).join(' '), lastName: parts.slice(2).join(' ') };
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

// Fecha → "YYYY-MM-DD" (fecha calendario, sin zona horaria). Acepta Date de
// Excel, número de serie de Excel y textos dd/mm/aaaa o aaaa-mm-dd.
// Devuelve null para vacíos y para el "0/1/1900" que deja Excel en celdas
// de fecha vacías con fórmula.
export function parseDate(value: Cell): string | null {
  let y: number, m: number, d: number;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // exceljs entrega la fecha calendario a medianoche UTC.
    y = value.getUTCFullYear(); m = value.getUTCMonth() + 1; d = value.getUTCDate();
  } else if (typeof value === 'number' && value > 0 && value < 2958466) {
    const date = new Date(EXCEL_EPOCH_UTC + Math.round(value) * 86_400_000);
    y = date.getUTCFullYear(); m = date.getUTCMonth() + 1; d = date.getUTCDate();
  } else if (typeof value === 'string') {
    const text = value.trim();
    let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text); // dd/mm/aaaa
    if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
    else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text))) { y = +match[1]; m = +match[2]; d = +match[3]; }
    else return null;
  } else return null;

  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null; // 31/02 → inválida
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "YYYY-MM-DD" → Date a medianoche LOCAL del servidor (mismo criterio que
// el resto del API para fechas calendario).
export function localDate(ymd: string, hour = 0): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const toUtc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(toYmd) - toUtc(fromYmd)) / 86_400_000);
}

// Monto: número o texto con símbolos ("$20.00", "Bs.S 14.975,80",
// "1,234.50"). Devuelve null si no se puede interpretar.
export function parseAmount(value: Cell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  if (typeof value !== 'string') return null;
  // Solo se aceptan símbolos de moneda alrededor del número: un texto como
  // "Gastos al 29/08" NO es un monto (antes daba 2908).
  const withoutCurrency = value.replace(/bs\.?\s*s?\.?|bs\.?f\.?|usd|ves|eur|us\$|\$|€/gi, '');
  if (/[a-z]/i.test(withoutCurrency) || /\d\s*\/\s*\d/.test(withoutCurrency)) return null;
  let text = withoutCurrency.replace(/[^\d.,-]/g, '');
  if (!text || !/\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > lastDot) {
    // Formato es-VE: 14.975,80 → coma decimal.
    text = text.replace(/\./g, '').replace(',', '.');
  } else {
    // Formato en-US: 1,234.50 → coma de miles.
    text = text.replace(/,/g, '');
  }
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function parseInteger(value: Cell): number | null {
  const n = typeof value === 'number' ? value : parseAmount(value);
  return n === null ? null : Math.round(n);
}

export type PaymentState = 'PAID' | 'PENDING';

// "✅ Pagado" / "⏳ Pendiente" / "si" / "no" → estado de pago.
export function parsePaymentStatus(value: Cell): PaymentState | null {
  const key = normalizeKey(cleanText(value));
  if (!key) return null;
  if (/(^| )(pagad[oa]|pago|si|ok|cancelad[oa]|paid)( |$)/.test(key)) return 'PAID';
  if (/(pendiente|debe|no pagad|por pagar|pending|^no$)/.test(key)) return 'PENDING';
  return null;
}

// Marca de asistencia en la cuadrícula: X, ✓, 1, sí…
export function isAttendanceMark(value: Cell): boolean | null {
  if (value === null || value === '') return false;
  if (value === true) return true;
  if (typeof value === 'number') return value > 0;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  if (['x', '✓', '✔', '1', 'si', 'sí', 'a', 'p', 'asistio', 'asistió'].includes(text)) return true;
  if (['-', '0', 'no', 'f', 'falta'].includes(text)) return false;
  return null; // valor desconocido → advertencia
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseEmail(value: Cell): { email: string | null; invalid: boolean } {
  const text = cleanText(value, 254)?.toLowerCase() ?? null;
  if (!text) return { email: null, invalid: false };
  return EMAIL_RE.test(text) ? { email: text, invalid: false } : { email: null, invalid: true };
}

export function parsePhone(value: Cell): string | null {
  const text = cleanText(value, 30);
  if (!text) return null;
  const digits = text.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? digits : null;
}

// Cédula/documento: solo letras y números (V-12.345.678 → V12345678).
export function parseIdentification(value: Cell): string | null {
  const text = cleanText(value, 30);
  if (!text) return null;
  const id = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return id.length >= 4 ? id : null;
}
