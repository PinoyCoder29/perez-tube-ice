/**
 * Pure aggregation functions (no database access) so the business definitions
 * can be unit-tested. Used by the dashboard, staff summary and reports.
 *
 * Definitions
 *  - Total Sales      = sum of totalAmount of COMPLETED sales created in the range (items + delivery fee - discount)
 *  - Credit Sales     = unpaid portion charged to customer accounts at sale time (ledger CHARGE on COMPLETED sales)
 *  - Cash Collections = every ACTIVE payment received in the range (sale payments + debt payments)
 *  - Debt Collections = ACTIVE DEBT_PAYMENT payments (never counted as sales)
 *  - Expenses         = ACTIVE expenses incurred in the range
 *  - Net Cash Flow    = Cash Collections - Expenses
 *  - Operating Result = Total Sales (accrual) - Expenses
 */
import { bucketKey, bucketKeys, bucketLabel, type DateRange } from '@/lib/date';

export interface RangeData {
  sales: { createdAt: Date; totalAmount: number; id: string }[];
  items: { saleId: string; productId: string; productName: string; quantity: number; lineTotal: number; sacks: number; createdAt: Date }[];
  payments: { createdAt: Date; amount: number; method: string; type: string }[];
  expenses: { incurredAt: Date; amount: number }[];
  charges: { createdAt: Date; amount: number }[];
}

export interface Summary {
  totalSales: number;
  transactions: number;
  cashCollections: number;
  creditSales: number;
  debtCollections: number;
  cashSalesPayments: number;
  digitalSalesPayments: number;
  expenses: number;
  netCashFlow: number;
  operatingResult: number;
  sacksSold: number;
  packsSold: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(d: RangeData): Summary {
  const totalSales = d.sales.reduce((a, s) => a + s.totalAmount, 0);
  const cashCollections = d.payments.reduce((a, p) => a + p.amount, 0);
  const debtCollections = d.payments.filter((p) => p.type === 'DEBT_PAYMENT').reduce((a, p) => a + p.amount, 0);
  const salePay = d.payments.filter((p) => p.type === 'SALE_PAYMENT');
  const cashSalesPayments = salePay.filter((p) => p.method === 'CASH').reduce((a, p) => a + p.amount, 0);
  const digitalSalesPayments = salePay.filter((p) => p.method !== 'CASH').reduce((a, p) => a + p.amount, 0);
  const creditSales = d.charges.reduce((a, c) => a + c.amount, 0);
  const expenses = d.expenses.reduce((a, e) => a + e.amount, 0);
  return {
    totalSales: r2(totalSales),
    transactions: d.sales.length,
    cashCollections: r2(cashCollections),
    creditSales: r2(creditSales),
    debtCollections: r2(debtCollections),
    cashSalesPayments: r2(cashSalesPayments),
    digitalSalesPayments: r2(digitalSalesPayments),
    expenses: r2(expenses),
    netCashFlow: r2(cashCollections - expenses),
    operatingResult: r2(totalSales - expenses),
    sacksSold: Math.round(d.items.reduce((a, i) => a + i.sacks, 0) * 1000) / 1000,
    packsSold: d.items.reduce((a, i) => a + i.quantity, 0),
  };
}

export function productBreakdown(d: RangeData) {
  const m = new Map<string, { productId: string; name: string; amount: number; quantity: number; sacks: number; sales: Set<string> }>();
  for (const i of d.items) {
    const x = m.get(i.productId) ?? { productId: i.productId, name: i.productName, amount: 0, quantity: 0, sacks: 0, sales: new Set<string>() };
    x.amount += i.lineTotal;
    x.quantity += i.quantity;
    x.sacks += i.sacks;
    x.sales.add(i.saleId);
    m.set(i.productId, x);
  }
  return [...m.values()].map((x) => ({ productId: x.productId, name: x.name, amount: r2(x.amount), quantity: x.quantity, sacks: x.sacks, transactions: x.sales.size }));
}

export interface SeriesPoint {
  key: string;
  label: string;
  sales: number;
  cash: number;
  creditSales: number;
  debtPayments: number;
  expenses: number;
  net: number;
  outstanding: number;
}

/** openingDebt = outstanding balance just before the range starts. */
export function buildSeries(d: RangeData, range: DateRange, openingDebt: number, ledgerInRange: { createdAt: Date; amount: number }[]): SeriesPoint[] {
  const keys = bucketKeys(range);
  const g = range.granularity;
  const pts = new Map<string, SeriesPoint>(
    keys.map((k) => [k, { key: k, label: bucketLabel(k, g), sales: 0, cash: 0, creditSales: 0, debtPayments: 0, expenses: 0, net: 0, outstanding: 0 }]),
  );
  const ledgerNet = new Map<string, number>();
  const add = (date: Date, fn: (p: SeriesPoint) => void) => {
    const p = pts.get(bucketKey(date, g));
    if (p) fn(p);
  };
  for (const s of d.sales) add(s.createdAt, (p) => (p.sales += s.totalAmount));
  for (const x of d.payments) {
    add(x.createdAt, (p) => {
      p.cash += x.amount;
      if (x.type === 'DEBT_PAYMENT') p.debtPayments += x.amount;
    });
  }
  for (const c of d.charges) add(c.createdAt, (p) => (p.creditSales += c.amount));
  for (const e of d.expenses) add(e.incurredAt, (p) => (p.expenses += e.amount));
  for (const l of ledgerInRange) {
    const k = bucketKey(l.createdAt, g);
    ledgerNet.set(k, (ledgerNet.get(k) ?? 0) + l.amount);
  }
  let running = openingDebt;
  const out: SeriesPoint[] = [];
  for (const k of keys) {
    const p = pts.get(k)!;
    running += ledgerNet.get(k) ?? 0;
    out.push({
      ...p,
      sales: r2(p.sales),
      cash: r2(p.cash),
      creditSales: r2(p.creditSales),
      debtPayments: r2(p.debtPayments),
      expenses: r2(p.expenses),
      net: r2(p.sales - p.expenses),
      outstanding: r2(running),
    });
  }
  return out;
}

export function pct(current: number, previous: number): number | null {
  return previous > 0 ? r2(((current - previous) / previous) * 100) : null;
}
