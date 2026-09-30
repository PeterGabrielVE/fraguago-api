// Interpreta el TEXTO de un comprobante de pago venezolano (pago móvil,
// transferencia, Zelle, voucher de punto de venta) ya leído por OCR.
// Son reglas deterministas: etiquetas habituales de los bancos ("Referencia",
// "Monto", "Teléfono origen"…) y formatos locales (1.234,56 Bs, 0414-1234567).
// Lo que no se reconoce queda en null: el staff siempre revisa antes de guardar.

export type OcrMethod = 'PAGO_MOVIL' | 'TRANSFER' | 'ZELLE' | 'CARD' | 'CASH' | 'OTHER';

export type ParsedReceipt = {
  isPaymentReceipt: boolean;
  paymentMethod: OcrMethod | null;
  reference: string | null;
  amount: number | null;
  currency: 'VES' | 'USD' | 'EUR' | null;
  bank: string | null;
  payerPhone: string | null;
  payerName: string | null;
  date: string | null; // YYYY-MM-DD
  /** Proporción de campos clave encontrados (0..1). */
  completeness: number;
};

// Bancos venezolanos (mismos nombres que la lista del frontend) y plataformas,
// con los alias con que aparecen en los comprobantes.
const BANKS: { name: string; aliases: string[] }[] = [
  { name: 'Banco de Venezuela', aliases: ['banco de venezuela', 'bdv', '0102'] },
  { name: 'Venezolano de Crédito', aliases: ['venezolano de credito', '0104'] },
  { name: 'Mercantil', aliases: ['mercantil', '0105'] },
  { name: 'Provincial (BBVA)', aliases: ['provincial', 'bbva', '0108'] },
  { name: 'Bancaribe', aliases: ['bancaribe', '0114'] },
  { name: 'Banco Exterior', aliases: ['exterior', '0115'] },
  { name: 'Banco Caroní', aliases: ['caroni', '0128'] },
  { name: 'Banesco', aliases: ['banesco', '0134'] },
  { name: 'Sofitasa', aliases: ['sofitasa', '0137'] },
  { name: 'Banco Plaza', aliases: ['banco plaza', '0138'] },
  { name: 'Bangente', aliases: ['bangente', '0146'] },
  { name: 'BFC Banco Fondo Común', aliases: ['fondo comun', 'bfc', '0151'] },
  { name: '100% Banco', aliases: ['100% banco', '100 banco', '0156'] },
  { name: 'DelSur', aliases: ['delsur', 'del sur', '0157'] },
  { name: 'Banco del Tesoro', aliases: ['tesoro', '0163'] },
  { name: 'Banco Agrícola de Venezuela', aliases: ['agricola', '0166'] },
  { name: 'Bancrecer', aliases: ['bancrecer', '0168'] },
  { name: 'R4 (Mi Banco)', aliases: ['mi banco', 'r4', '0169'] },
  { name: 'Banco Activo', aliases: ['banco activo', '0171'] },
  { name: 'Bancamiga', aliases: ['bancamiga', '0172'] },
  { name: 'Banco Internacional de Desarrollo', aliases: ['internacional de desarrollo', '0173'] },
  { name: 'Banplus', aliases: ['banplus', '0174'] },
  { name: 'Banco Digital de los Trabajadores (Bicentenario)', aliases: ['bicentenario', 'digital de los trabajadores', '0175'] },
  { name: 'Banfanb', aliases: ['banfanb', '0177'] },
  { name: 'N58 Banco Digital', aliases: ['n58', '0178'] },
  { name: 'BNC (Banco Nacional de Crédito)', aliases: ['nacional de credito', 'bnc', '0191'] },
  { name: 'Instituto Municipal de Crédito Popular', aliases: ['credito popular', '0601'] },
  { name: 'Zelle', aliases: ['zelle'] },
  { name: 'PayPal', aliases: ['paypal'] },
  { name: 'Binance Pay', aliases: ['binance'] },
  { name: 'Zinli', aliases: ['zinli'] },
  { name: 'Wally', aliases: ['wally'] },
  { name: 'Reserve', aliases: ['reserve'] },
  { name: 'AirTM', aliases: ['airtm'] },
];

// Líneas que describen al RECEPTOR del pago (el gym): sus datos no son del pagador.
const DESTINATION = /destino|receptor|beneficiario|destinatario|recibe|abonad|pagado a|enviado a|\bpara\b|\bto\b/;
// Líneas que describen al EMISOR.
const ORIGIN = /origen|emisor|ordenante|remitente|pagador|desde|debitad|\bfrom\b|enviado por/;

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

// Minúsculas y sin acentos, para comparar.
function fold(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// "1.234,56" / "1,234.56" / "1234,5" / "20" → número. El último separador
// seguido de 1-2 dígitos es el decimal; los demás son de miles.
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const decimal = cleaned.match(/[.,](\d{1,2})$/);
  const integerPart = decimal ? cleaned.slice(0, -decimal[0].length) : cleaned;
  const value = Number(`${integerPart.replace(/[.,]/g, '')}${decimal ? `.${decimal[1]}` : ''}`);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

function detectMethod(text: string): OcrMethod | null {
  if (/pago\s*movil|pagomovil|\bp2p\b|\bc2p\b|telefono (?:origen|destino|emisor|receptor)/.test(text)) return 'PAGO_MOVIL';
  if (/zelle/.test(text)) return 'ZELLE';
  if (/binance|paypal|zinli|wally|airtm|reserve/.test(text)) return 'OTHER';
  if (/aprobacion|punto de venta|voucher|\blote\b|terminal|\bafiliado\b|tarjeta/.test(text)) return 'CARD';
  if (/transferencia|transferido|cuenta (?:origen|destino)|n(?:ro|°|º)?\.? de cuenta/.test(text)) return 'TRANSFER';
  return null;
}

// Valor que sigue a una etiqueta: en la misma línea o, si la línea termina en
// la etiqueta, en la siguiente (así presentan los datos muchas apps).
function valueAfterLabel(lines: string[], label: RegExp, value: RegExp): { value: string; line: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const folded = fold(lines[i]);
    const match = label.exec(folded);
    if (!match) continue;
    const rest = lines[i].slice(match.index + match[0].length);
    const sameLine = value.exec(rest);
    if (sameLine) return { value: sameLine[1] ?? sameLine[0], line: i };
    const next = lines[i + 1] && value.exec(lines[i + 1]);
    if (next) return { value: next[1] ?? next[0], line: i + 1 };
  }
  return null;
}

function findReference(lines: string[], method: OcrMethod | null): string | null {
  const labeled = valueAfterLabel(
    lines,
    /(?:n(?:ro|umero|°|º)?\.?\s*(?:de\s*)?)?(?:referencia|\bref\b\.?|operacion|comprobante|confirmacion|confirmation|aprobacion|transaction id|id de (?:la )?transaccion|codigo)/,
    /[:#\s.-]*([A-Z0-9][A-Z0-9 -]{3,30})/i,
  );
  const clean = (raw: string) =>
    method === 'PAGO_MOVIL' || /^\s*[\d -]+$/.test(raw) ? raw.replace(/\D/g, '') : raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (labeled) {
    const ref = clean(labeled.value);
    if (ref.length >= 4 && ref.length <= 30) return ref;
  }
  // Sin etiqueta legible: la corrida de 8-20 dígitos más larga que no sea
  // teléfono, cédula ni cuenta bancaria (20 dígitos que empiezan por 01).
  const candidates = lines
    .filter((line) => !/c\.?\s*i\.?|cedula|\bv-|telefono|celular|cuenta/i.test(fold(line)))
    .flatMap((line) => line.match(/\d[\d ]{6,24}\d/g) ?? [])
    .map((run) => run.replace(/\s/g, ''))
    .filter((run) => run.length >= 8 && run.length <= 20 && !/^(?:58)?0?4(?:12|14|16|22|24|26)\d{7}$/.test(run) && !/^01\d{18}$/.test(run));
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

// Monto con su moneda si aparece al lado: "Bs. 1.234,56", "1.234,56 Bs", "$20.00".
const MONEY = /(bs\.?s?|ves|usd|eur|\$|€)?\s*(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(bs\b\.?|ves\b|usd\b|eur\b|\$|€)?/i;
const AMOUNT_LABEL = /monto|importe|amount|total|cantidad|pagaste|enviaste|you sent/;

function findAmount(lines: string[]): { amount: number; currency: ParsedReceipt['currency'] } | null {
  const pick = (text: string, requireSymbol = false) => {
    for (const match of text.matchAll(new RegExp(MONEY, 'gi'))) {
      const symbol = `${match[1] ?? ''}${match[3] ?? ''}`;
      if (requireSymbol && !symbol) continue;
      const amount = parseAmount(match[2]);
      if (amount) return { amount, currency: currencyOf(symbol) };
    }
    return null;
  };
  // Tras la etiqueta "Monto" (misma línea o la siguiente).
  for (let i = 0; i < lines.length; i++) {
    const match = AMOUNT_LABEL.exec(fold(lines[i]));
    if (!match) continue;
    const found = pick(lines[i].slice(match.index + match[0].length)) ?? (lines[i + 1] ? pick(lines[i + 1]) : null);
    if (found) return found;
  }
  // Sin etiqueta: primer número acompañado de símbolo de moneda.
  for (const line of lines) {
    const found = pick(line, true);
    if (found) return found;
  }
  return null;
}

function currencyOf(text: string): ParsedReceipt['currency'] {
  const t = fold(text);
  if (/bs|ves|bolivar/.test(t)) return 'VES';
  if (/€|eur/.test(t)) return 'EUR';
  if (/\$|usd|dolar/.test(t)) return 'USD';
  return null;
}

const PHONE = /(?:\+?58[\s-]?)?\(?0?(4(?:12|14|16|22|24|26))\)?[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})/;

function findPayerPhone(lines: string[]): string | null {
  const phones = lines
    .map((line, i) => ({ match: PHONE.exec(line), line: fold(line), prev: fold(lines[i - 1] ?? '') }))
    .filter((p) => p.match)
    .map((p) => ({
      phone: `0${p.match![1]}${p.match![2]}${p.match![3]}${p.match![4]}`,
      origin: ORIGIN.test(p.line) || (!PHONE.test(p.prev) && ORIGIN.test(p.prev)),
      destination: DESTINATION.test(p.line) || (!PHONE.test(p.prev) && DESTINATION.test(p.prev)),
    }));
  return (phones.find((p) => p.origin) ?? phones.find((p) => !p.destination))?.phone ?? null;
}

function findBank(lines: string[]): string | null {
  const matches: { name: string; line: number; origin: boolean; destination: boolean }[] = [];
  lines.forEach((line, i) => {
    const folded = fold(line);
    const context = `${fold(lines[i - 1] ?? '')} ${folded}`;
    for (const bank of BANKS) {
      const hit = bank.aliases.some((alias) =>
        /^\d+$/.test(alias)
          ? new RegExp(`(?:^|\\D)${alias}(?:\\s*[-–]|\\s+[a-z])`).test(folded) // "0105 - Mercantil"
          : new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(alias)}(?:$|[^a-z0-9])`).test(folded),
      );
      if (hit) matches.push({ name: bank.name, line: i, origin: ORIGIN.test(context), destination: DESTINATION.test(context) });
    }
  });
  // Prioridad: banco marcado como origen; si no, el primero que no sea destino
  // (el del encabezado/logo de la app con que se pagó).
  return (matches.find((m) => m.origin && !m.destination) ?? matches.find((m) => !m.destination))?.name ?? null;
}

function findPayerName(lines: string[]): string | null {
  const labeled = valueAfterLabel(
    lines,
    /titular|ordenante|remitente|nombre del (?:emisor|pagador)|enviado por|\bfrom\b|\bde:/,
    /[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ.' ]{3,60})/,
  );
  const name = labeled?.value.replace(/\s+/g, ' ').trim();
  if (!name || DESTINATION.test(fold(lines[labeled!.line]))) return null;
  return name.split(' ').length >= 2 ? name : null;
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 2015 || date.getTime() > Date.now() + 2 * 86_400_000) return null;
  return date.toISOString().slice(0, 10);
}

function findDate(text: string): string | null {
  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (iso) {
    const date = validDate(+iso[1], +iso[2], +iso[3]);
    if (date) return date;
  }
  for (const m of text.matchAll(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/g)) {
    const date = validDate(+m[3], +m[2], +m[1]); // dd/mm/aaaa (formato venezolano)
    if (date) return date;
  }
  const folded = fold(text);
  // "29 sep 2026" / "29 de septiembre de 2026"
  const named = /(\d{1,2})\s*(?:de\s*)?([a-z]{3})[a-z]*\.?\s*(?:de\s*|,\s*)?(\d{4})/.exec(folded);
  if (named && MONTHS[named[2]]) return validDate(+named[3], MONTHS[named[2]], +named[1]);
  // "Sep 29, 2026" (Zelle, PayPal)
  const english = /\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(folded);
  if (english && MONTHS[english[1]]) return validDate(+english[3], MONTHS[english[1]], +english[2]);
  return null;
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = fold(lines.join('\n'));

  const paymentMethod = detectMethod(text);
  const reference = findReference(lines, paymentMethod);
  const money = findAmount(lines);
  const bank = findBank(lines);
  const payerPhone = paymentMethod === 'PAGO_MOVIL' || paymentMethod === null ? findPayerPhone(lines) : null;
  const currency = money?.currency
    ?? (paymentMethod === 'ZELLE' ? 'USD' : paymentMethod === 'PAGO_MOVIL' || paymentMethod === 'TRANSFER' ? 'VES' : null);

  const keyFields = [paymentMethod, reference, money?.amount, findDate(text)];
  const completeness = keyFields.filter((v) => v !== null && v !== undefined).length / keyFields.length;
  const looksLikeReceipt = Boolean(reference || money) && (paymentMethod !== null || /pago|operacion|exitos|comprobante|recibo|payment|transaccion/.test(text));

  return {
    isPaymentReceipt: looksLikeReceipt,
    paymentMethod,
    reference,
    amount: money?.amount ?? null,
    currency,
    bank,
    payerPhone,
    payerName: findPayerName(lines),
    date: findDate(text),
    completeness,
  };
}
