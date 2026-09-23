import { Workbook } from 'exceljs';

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | Date | null | undefined;
  width?: number;
  // Formato numérico de Excel (p. ej. '#,##0.00') o de fecha.
  numFmt?: string;
};

// Evita "CSV/formula injection": una celda que empieza con = + - @ (o tab/CR)
// se ejecuta como fórmula al abrirla en Excel. Se antepone un apóstrofo.
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: string | number | Date | null | undefined, delimiter: string, withTime = true): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    text = `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
    if (withTime) text += ` ${pad(value.getHours())}:${pad(value.getMinutes())}`;
  } else if (typeof value === 'number') {
    // Excel en español usa coma decimal cuando el separador es ";".
    text = delimiter === ';' ? String(value).replace('.', ',') : String(value);
  } else {
    text = neutralizeFormula(value);
  }
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

// CSV con BOM UTF-8 (para que Excel muestre bien tildes y ñ) y ";" como
// separador, que es lo que espera Excel con configuración regional en español.
export function toCsv<T>(columns: ExportColumn<T>[], rows: T[], delimiter = ';'): Buffer {
  const lines = [
    columns.map((c) => csvCell(c.header, delimiter)).join(delimiter),
    ...rows.map((row) => columns.map((c) => csvCell(c.value(row), delimiter, c.numFmt?.includes('hh') ?? true)).join(delimiter)),
  ];
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function toXlsx<T>(sheetName: string, columns: ExportColumn<T>[], rows: T[]): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'FraguaGo';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((c, i) => ({ key: String(i), header: c.header, width: c.width ?? 18, style: c.numFmt ? { numFmt: c.numFmt } : {} }));

  for (const row of rows) {
    sheet.addRow(columns.map((c) => {
      const v = c.value(row);
      if (v === undefined || v === null) return null;
      return typeof v === 'string' ? neutralizeFormula(v) : v;
    }));
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
  header.alignment = { vertical: 'middle' };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
