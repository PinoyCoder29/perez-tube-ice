import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { SEED_PRODUCTS } from '../prisma/seed-data';
import { deliveryPaymentBody, saleCreate, saleItemInput } from '@/lib/validation';
import { safeCell, toXlsx } from '@/lib/export/xlsx';
import { resolveRange, bucketKeys } from '@/lib/date';
import { businessDate } from '@/lib/formatting';

describe('POS product order', () => {
  it('lists Tube Ice before Crushed Ice by display order, with no hardcoded prices in the UI', () => {
    const ordered = [...SEED_PRODUCTS].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.name);
    expect(ordered).toEqual(['Tube Ice', 'Crushed Ice']);
  });
});

describe('custom price validation (shape)', () => {
  const base = { idempotencyKey: 'abcdefgh1', payments: [] };
  const custom = (price: unknown) => saleCreate.safeParse({ ...base, items: [{ productId: 'p1', customUnitPrice: price, quantity: 1 }] });
  it('accepts a valid positive amount', () => {
    expect(custom('37.50').success).toBe(true);
    expect(custom(12).success).toBe(true);
  });
  it.each([['-5'], ['0'], [0], ['abc'], ['1e5'], ['12.345'], ['']])('rejects %s', (v) => {
    expect(custom(v).success).toBe(false);
  });
  it('requires either a price button or a custom price, never both or neither', () => {
    expect(saleItemInput.safeParse({ priceOptionId: 'a', quantity: 1 }).success).toBe(true);
    expect(saleItemInput.safeParse({ priceOptionId: 'a', productId: 'p', customUnitPrice: '5', quantity: 1 }).success).toBe(false);
    expect(saleItemInput.safeParse({ productId: 'p', quantity: 1 }).success).toBe(false);
  });
  it('rejects zero/negative delivery payments', () => {
    expect(deliveryPaymentBody.safeParse({ idempotencyKey: 'abcdefgh1', method: 'GCASH', amount: '0' }).success).toBe(false);
    expect(deliveryPaymentBody.safeParse({ idempotencyKey: 'abcdefgh1', method: 'GCASH', amount: '50.00', reference: '123456' }).success).toBe(true);
  });
});

describe('daily boundaries', () => {
  it('a single custom day is one business day, shown hourly', () => {
    const r = resolveRange('custom', { from: '2026-10-12', to: '2026-10-12' }, new Date(), 'Asia/Manila');
    expect(r.end.getTime() - r.start.getTime()).toBe(86400000);
    expect(bucketKeys(r)).toHaveLength(24);
    expect(r.start.toISOString()).toBe('2026-10-11T16:00:00.000Z');
  });
  it('businessDate returns a YYYY-MM-DD string', () => {
    expect(businessDate(-1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('xlsx export', () => {
  it('neutralises formula injection', () => {
    expect(safeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(safeCell('+639171234567')).toBe("'+639171234567");
    expect(safeCell('Juan')).toBe('Juan');
  });
  it('produces a real workbook with numeric money, text phones and a header block', async () => {
    const buf = await toXlsx({
      title: 'Test report',
      rangeLabel: '2026-10-01 to 2026-10-31',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'money' },
      ],
      rows: [{ name: '=cmd()', phone: '09171234567', amount: 1250.5 }],
    });
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    expect(String(ws.getCell('A1').value)).toContain('Test report');
    expect(String(ws.getCell('A2').value)).toContain('2026-10-01');
    expect(String(ws.getCell('A3').value)).toContain('Generated');
    expect(ws.getCell('A6').value).toBe("'=cmd()");
    expect(ws.getCell('B6').value).toBe('09171234567');
    expect(ws.getCell('C6').value).toBe(1250.5);
  });
});
