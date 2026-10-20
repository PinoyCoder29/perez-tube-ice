import { prisma } from '@/lib/db/prisma';
import { num } from '@/lib/money';
import { previousRange, resolveRange, type DateRange, type Period } from '@/lib/date';
import { buildSeries, pct, productBreakdown, summarize, type RangeData } from './analytics';
import { listDeliveries } from './deliveries.service';

export async function loadRangeData(range: DateRange): Promise<RangeData> {
  const inRange = { gte: range.start, lt: range.end };
  const [sales, items, payments, expenses, charges] = await Promise.all([
    prisma.sale.findMany({ where: { status: 'COMPLETED', createdAt: inRange }, select: { id: true, createdAt: true, totalAmount: true } }),
    prisma.saleItem.findMany({
      where: { sale: { status: 'COMPLETED', createdAt: inRange } },
      select: { saleId: true, productId: true, productNameSnapshot: true, quantity: true, lineTotal: true, sacks: true, sale: { select: { createdAt: true } } },
    }),
    prisma.payment.findMany({ where: { status: 'ACTIVE', createdAt: inRange }, select: { createdAt: true, amount: true, paymentMethod: true, paymentType: true } }),
    prisma.expense.findMany({ where: { status: 'ACTIVE', incurredAt: inRange }, select: { incurredAt: true, amount: true } }),
    prisma.ledgerEntry.findMany({ where: { type: 'CHARGE', createdAt: inRange, sale: { status: 'COMPLETED' } }, select: { createdAt: true, amount: true } }),
  ]);
  return {
    sales: sales.map((s) => ({ id: s.id, createdAt: s.createdAt, totalAmount: num(s.totalAmount) })),
    items: items.map((i) => ({
      saleId: i.saleId,
      productId: i.productId,
      productName: i.productNameSnapshot,
      quantity: i.quantity,
      lineTotal: num(i.lineTotal),
      sacks: num(i.sacks),
      createdAt: i.sale.createdAt,
    })),
    payments: payments.map((p) => ({ createdAt: p.createdAt, amount: num(p.amount), method: p.paymentMethod, type: p.paymentType })),
    expenses: expenses.map((e) => ({ incurredAt: e.incurredAt, amount: num(e.amount) })),
    charges: charges.map((c) => ({ createdAt: c.createdAt, amount: num(c.amount) })),
  };
}

async function ledgerInRange(range: DateRange) {
  const rows = await prisma.ledgerEntry.findMany({ where: { createdAt: { gte: range.start, lt: range.end } }, select: { createdAt: true, amount: true } });
  return rows.map((r) => ({ createdAt: r.createdAt, amount: num(r.amount) }));
}

async function openingDebt(before: Date) {
  const r = await prisma.ledgerEntry.aggregate({ where: { createdAt: { lt: before } }, _sum: { amount: true } });
  return num(r._sum.amount);
}

export async function getDashboard(period: Period, from?: string | null, to?: string | null) {
  const range = resolveRange(period, { from, to });
  const prev = previousRange(range);
  const [cur, prv, curLedger, prvLedger, curOpen, prvOpen, outstanding, pending, deliveryList] = await Promise.all([
    loadRangeData(range),
    loadRangeData(prev),
    ledgerInRange(range),
    ledgerInRange(prev),
    openingDebt(range.start),
    openingDebt(prev.start),
    prisma.ledgerEntry.aggregate({ _sum: { amount: true } }),
    prisma.delivery.count({ where: { status: { in: ['PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY'] } } }),
    listDeliveries({ period, from, to }),
  ]);

  const summary = summarize(cur);
  const previous = summarize(prv);
  const series = buildSeries(cur, range, curOpen, curLedger);
  const prevSeries = buildSeries(prv, prev, prvOpen, prvLedger);

  const comparison = series.map((p, i) => ({ label: p.label, current: p.sales, previous: prevSeries[i]?.sales ?? null }));
  const hasPrevious = previous.transactions > 0 || previous.expenses > 0 || previous.cashCollections > 0;
  const diff = summary.totalSales - previous.totalSales;

  const products = productBreakdown(cur);
  const sumOf = (name: string) => products.find((p) => p.name.toLowerCase() === name) ?? { name, amount: 0, quantity: 0, sacks: 0, transactions: 0 };

  return {
    period,
    range: { label: range.label, start: range.start, end: range.end, granularity: range.granularity },
    previousLabel: prev.label,
    hasPrevious,
    summary,
    previous: hasPrevious ? previous : null,
    changes: hasPrevious
      ? {
          totalSales: pct(summary.totalSales, previous.totalSales),
          cashCollections: pct(summary.cashCollections, previous.cashCollections),
          creditSales: pct(summary.creditSales, previous.creditSales),
          expenses: pct(summary.expenses, previous.expenses),
        }
      : null,
    outstandingDebt: num(outstanding._sum.amount),
    pendingDeliveries: pending,
    // Delivery monitoring (orders created by Staff, scheduled in the selected period)
    deliveries: {
      ...deliveryList.totals,
      counts: deliveryList.counts,
      daily: Object.values(
        deliveryList.rows.reduce<Record<string, { date: string; orders: number; delivered: number; value: number }>>((acc, d) => {
          const k = d.scheduledAt.toISOString().slice(0, 10);
          const x = (acc[k] ??= { date: k, orders: 0, delivered: 0, value: 0 });
          if (d.status !== 'CANCELLED') { x.orders += 1; x.value += Number(d.orderTotal); }
          if (d.status === 'DELIVERED') x.delivered += 1;
          return acc;
        }, {}),
      ).sort((a, b) => a.date.localeCompare(b.date)),
    },
    crushedIce: sumOf('crushed ice'),
    tubeIce: sumOf('tube ice'),
    series,
    comparison: { points: comparison, current: summary.totalSales, previous: previous.totalSales, diff: Math.round(diff * 100) / 100, pct: hasPrevious ? pct(summary.totalSales, previous.totalSales) : null, hasPrevious },
    products,
    paymentBreakdown: [
      { name: 'Cash payments', value: summary.cashSalesPayments },
      { name: 'Digital payments', value: summary.digitalSalesPayments },
      { name: 'Credit sales', value: summary.creditSales },
      { name: 'Debt collections', value: summary.debtCollections },
    ],
  };
}

export async function getStaffSummary() {
  const range = resolveRange('today');
  const data = await loadRangeData(range);
  const s = summarize(data);
  const debts = await prisma.ledgerEntry.aggregate({ _sum: { amount: true } });
  return { ...s, outstandingDebt: num(debts._sum.amount) };
}
