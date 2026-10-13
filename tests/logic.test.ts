import { describe, expect, it } from 'vitest';
import { normalizePhone, telHref } from '@/lib/phone';
import { addDays, bucketKeys, groupKey, previousRange, resolveRange, zonedTimeToUtc } from '@/lib/date';
import { buildSeries, pct, summarize, type RangeData } from '@/services/analytics';

const TZ = 'Asia/Manila';

describe('phone', () => {
  it('normalises Philippine formats', () => {
    expect(normalizePhone('0917 123 4567')).toBe('09171234567');
    expect(normalizePhone('+639171234567')).toBe('09171234567');
    expect(normalizePhone('12345')).toBeNull();
    expect(telHref('09171234567')).toBe('tel:+639171234567');
  });
});

describe('date ranges (Asia/Manila)', () => {
  const now = new Date('2026-10-13T20:00:00Z'); // 2026-10-14 04:00 in Manila
  it('uses the business day, not UTC', () => {
    const r = resolveRange('today', {}, now, TZ);
    expect(r.start.toISOString()).toBe('2026-10-13T16:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-14T16:00:00.000Z');
  });
  it('week starts Monday and month/year boundaries are correct', () => {
    expect(resolveRange('week', {}, now, TZ).startYmd).toEqual({ y: 2026, m: 10, d: 12 });
    const m = resolveRange('month', {}, now, TZ);
    expect(m.endYmd).toEqual({ y: 2026, m: 11, d: 1 });
    expect(bucketKeys(m)).toHaveLength(31);
    expect(bucketKeys(resolveRange('year', {}, now, TZ))).toHaveLength(12);
  });
  it('previous month wraps across year-end', () => {
    const jan = resolveRange('month', {}, new Date('2027-01-10T00:00:00Z'), TZ);
    expect(previousRange(jan, TZ).startYmd).toEqual({ y: 2026, m: 12, d: 1 });
  });
  it('custom ranges include the end day and group keys use local dates', () => {
    const r = resolveRange('custom', { from: '2026-01-30', to: '2026-02-02' }, now, TZ);
    expect(bucketKeys(r)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
    expect(groupKey(zonedTimeToUtc(2026, 3, 1, 0, 30, TZ), 'month', TZ)).toBe('2026-03');
    expect(addDays({ y: 2026, m: 12, d: 31 }, 1)).toEqual({ y: 2027, m: 1, d: 1 });
  });
});

describe('financial definitions', () => {
  const t = (s: string) => new Date(s);
  const data: RangeData = {
    sales: [
      { id: 's1', createdAt: t('2026-10-13T02:00:00Z'), totalAmount: 40 },
      { id: 's2', createdAt: t('2026-10-13T03:00:00Z'), totalAmount: 260 },
    ],
    items: [
      { saleId: 's1', productId: 'p1', productName: 'Crushed Ice', quantity: 2, lineTotal: 40, sacks: 0, createdAt: t('2026-10-13T02:00:00Z') },
      { saleId: 's2', productId: 'p2', productName: 'Tube Ice', quantity: 1, lineTotal: 260, sacks: 1, createdAt: t('2026-10-13T03:00:00Z') },
    ],
    payments: [
      { createdAt: t('2026-10-13T02:00:00Z'), amount: 40, method: 'CASH', type: 'SALE_PAYMENT' },
      { createdAt: t('2026-10-13T04:00:00Z'), amount: 100, method: 'CASH', type: 'DEBT_PAYMENT' },
    ],
    expenses: [{ incurredAt: t('2026-10-13T05:00:00Z'), amount: 150 }],
    charges: [{ createdAt: t('2026-10-13T03:00:00Z'), amount: 260 }],
  };
  it('keeps sales, credit, collections and expenses separate', () => {
    const s = summarize(data);
    expect(s.totalSales).toBe(300); // a debt payment is not a sale
    expect(s.creditSales).toBe(260); // unpaid credit is not cash
    expect(s.cashCollections).toBe(140);
    expect(s.debtCollections).toBe(100);
    expect(s.expenses).toBe(150); // expenses never reduce gross sales
    expect(s.netCashFlow).toBe(-10);
    expect(s.operatingResult).toBe(150);
    expect(s.sacksSold).toBe(1);
  });
  it('series totals reconcile with the summary and outstanding balance rolls forward', () => {
    const range = resolveRange('today', {}, t('2026-10-13T06:00:00Z'), TZ);
    const ledger = [{ createdAt: t('2026-10-13T03:00:00Z'), amount: 260 }, { createdAt: t('2026-10-13T04:00:00Z'), amount: -100 }];
    const series = buildSeries(data, range, 300, ledger);
    expect(series.reduce((a, p) => a + p.sales, 0)).toBe(300);
    expect(series[series.length - 1].outstanding).toBe(460); // 300 + 260 - 100
  });
  it('omits percentages when there is no history', () => {
    expect(pct(100, 0)).toBeNull();
    expect(pct(150, 100)).toBe(50);
  });
});
