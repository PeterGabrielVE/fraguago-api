import { BadRequestException } from '@nestjs/common';
import { Workbook, type CellValue } from 'exceljs';

// Valor de celda ya "aplanado": fórmulas → su resultado, texto enriquecido →
// texto plano, errores de Excel (#N/A, #REF!) → null.
export type Cell = string | number | boolean | Date | null;

export type Sheet = { name: string; rows: Cell[][] };

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS = 5000;

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" (zip)

function flatten(value: CellValue): Cell {
  if (value === null || value === undefined) return null;
  // Fechas inválidas (p. ej. el "00/01/1900" de fórmulas sobre celdas vacías).
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    if ('error' in value) return null;
    if ('result' in value) return flatten((value as { result?: CellValue }).result ?? null);
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    if ('text' in value) return flatten((value as { text: CellValue }).text);
  }
  return null;
}

async function readXlsx(buffer: Buffer): Promise<Sheet[]> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('No se pudo leer el archivo Excel. ¿Está dañado o protegido con contraseña?');
  }
  return workbook.worksheets
    .filter((ws) => ws.state === 'visible')
    .map((ws) => {
      const rows: Cell[][] = [];
      ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber > MAX_ROWS + 50) return;
        const cells: Cell[] = [];
        for (let c = 1; c <= ws.columnCount; c++) cells.push(flatten(row.getCell(c).value));
        rows[rowNumber - 1] = cells;
      });
      // Filas faltantes (eachRow salta las inexistentes) → vacías.
      for (let i = 0; i < rows.length; i++) rows[i] ??= [];
      return { name: ws.name, rows };
    });
}

// Detecta el separador mirando la primera línea no vacía (Excel en español
// exporta CSV con ";").
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

// Parser CSV (RFC 4180): comillas, comillas escapadas ("") y saltos de línea
// dentro de campos entrecomillados.
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
      if (rows.length > MAX_ROWS + 50) break;
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function readSpreadsheet(buffer: Buffer, fileName: string): Promise<Sheet[]> {
  if (!buffer?.length) throw new BadRequestException('El archivo está vacío');
  if (buffer.length > MAX_FILE_BYTES) throw new BadRequestException('El archivo supera los 5 MB');

  const lower = fileName.toLowerCase();
  const isZip = XLSX_MAGIC.every((b, i) => buffer[i] === b);

  if (lower.endsWith('.xlsx')) {
    // La extensión no alcanza: se verifica la firma real del archivo.
    if (!isZip) throw new BadRequestException('El archivo no es un Excel (.xlsx) válido');
    return readXlsx(buffer);
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    if (isZip) throw new BadRequestException('El archivo parece un Excel renombrado a .csv');
    const text = buffer.toString('utf8').replace(/^\uFEFF/, ''); // quita BOM
    if (text.includes('\u0000')) throw new BadRequestException('El archivo CSV contiene datos binarios');
    return [{ name: 'CSV', rows: parseCsv(text) }];
  }
  if (lower.endsWith('.xls')) {
    throw new BadRequestException('El formato .xls (Excel 97-2003) no está soportado: guárdalo como .xlsx');
  }
  throw new BadRequestException('Formato no soportado: sube un archivo .xlsx o .csv');
}
