import ExcelJS from 'exceljs';
import { formatDateTime } from '@/lib/formatting';
import { getTimezone, toLocalWallClock } from '@/lib/date';
import type { ReportResult } from '@/services/reports.service';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Neutralise values a spreadsheet could interpret as a formula (formula-injection guard). */
export function safeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** Builds an .xlsx workbook from an authorised report result. Phone numbers / references stay text; amounts are numeric currency. */
export async function toXlsx(r: ReportResult): Promise<Buffer> {
  const tz = getTimezone();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Perez Ice';
  wb.created = new Date();
  const ws = wb.addWorksheet(r.title.slice(0, 28).replace(/[\\/?*[\]:]/g, ' '));
  const ncol = Math.max(r.columns.length, 3);

  ws.addRow([`PEREZ ICE — ${r.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`Period: ${r.rangeLabel ?? ''}`]);
  ws.addRow([`Generated: ${formatDateTime(new Date(), tz)} (${tz})`]);
  ws.addRow([]);
  const header = ws.addRow(r.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF13315C' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  for (let i = 1; i <= 3; i++) ws.mergeCells(i, 1, i, ncol);

  for (const row of r.rows) {
    const cells = r.columns.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined || v === '') return null;
      if (c.type === 'money' || c.type === 'number') return Number(v);
      if (c.type === 'datetime') return toLocalWallClock(new Date(String(v)), tz);
      return safeCell(String(v));
    });
    const added = ws.addRow(cells);
    r.columns.forEach((c, i) => {
      const cell = added.getCell(i + 1);
      if (c.type === 'money') cell.numFmt = '"₱"#,##0.00';
      else if (c.type === 'number') cell.numFmt = '#,##0.###';
      else if (c.type === 'datetime') cell.numFmt = 'yyyy-mm-dd hh:mm';
      else if (c.type === 'text') cell.numFmt = '@';
    });
  }
  r.columns.forEach((c, i) => {
    const widest = Math.max(c.label.length, ...r.rows.slice(0, 200).map((x) => String(x[c.key] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(50, Math.max(12, widest + 2));
  });
  ws.views = [{ state: 'frozen', ySplit: 5 }];
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
