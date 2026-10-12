import { BadRequestException } from '@nestjs/common';

// Los reportes agrupan por día y hora "de pared" del gym, no del servidor
// (Render corre en UTC: un check-in de las 20:00 caería en el día siguiente).
const TZ = process.env.APP_TZ || process.env.RETENTION_CRON_TZ || 'America/Caracas';
const DAY_MS = 86_400_000;
// Por encima de un año las consultas traen demasiadas filas para agregarlas en memoria.
const MAX_RANGE_DAYS = 366;
// Hasta aquí la serie va por día; rangos más largos se agrupan por mes.
const MAX_DAILY_BUCKETS = 92;

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export type Granularity = 'day' | 'month';

export type ReportRange = {
  from: string; // YYYY-MM-DD
  to: string;
  start: Date; // 00:00 de `from` en la zona del gym
  end: Date; // exclusivo: 00:00 del día siguiente a `to`
  // Periodo inmediatamente anterior y de igual duración, para comparar.
  prevStart: Date;
  prevEnd: Date;
  days: number;
  granularity: Granularity;
};

// Fecha y hora de un instante en la zona del gym.
export function localParts(date: Date): { ymd: string; hour: number; weekday: number } {
  const parts: Record<string, string> = {};
  for (const p of partsFormat.formatToParts(date)) parts[p.type] = p.value;
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  return { ymd, hour: Number(parts.hour), weekday: new Date(`${ymd}T00:00:00Z`).getUTCDay() };
}

// Instante en que empieza el día `ymd` en la zona del gym.
function startOfLocalDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d);
  let instant = wallAsUtc;
  // Dos pasadas: la segunda corrige el desfase si hay cambio de horario ese día.
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(instant));
    const [py, pm, pd] = p.ymd.split('-').map(Number);
    instant -= Date.UTC(py, pm - 1, pd, p.hour) - wallAsUtc;
  }
  return new Date(instant);
}

function addDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function parseRange(from: string, to: string): ReportRange {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  if (Number.isNaN(days)) throw new BadRequestException('Rango de fechas inválido');
  if (days < 1) throw new BadRequestException('La fecha "desde" es posterior a "hasta"');
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestException(`El rango máximo de un reporte es de ${MAX_RANGE_DAYS} días`);
  }
  return {
    from,
    to,
    start: startOfLocalDay(from),
    end: startOfLocalDay(addDays(to, 1)),
    prevStart: startOfLocalDay(addDays(from, -days)),
    prevEnd: startOfLocalDay(from),
    days,
    granularity: days > MAX_DAILY_BUCKETS ? 'month' : 'day',
  };
}

// Clave del tramo de la serie al que pertenece un instante.
export function bucketKey(date: Date, granularity: Granularity): string {
  const { ymd } = localParts(date);
  return granularity === 'month' ? ymd.slice(0, 7) : ymd;
}

// Todos los tramos del rango en orden (incluidos los que no tienen datos).
export function bucketKeys(range: ReportRange): string[] {
  const keys: string[] = [];
  for (let ymd = range.from; ymd <= range.to; ymd = addDays(ymd, 1)) {
    const key = range.granularity === 'month' ? ymd.slice(0, 7) : ymd;
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
}
