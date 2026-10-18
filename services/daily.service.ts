import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { num } from '@/lib/money';
import { STAFF_HISTORY_DAYS } from '@/lib/constants';
import { diffDays, localYmd, parseYmd, resolveRange } from '@/lib/date';
import { productBreakdown, summarize } from './analytics';
import { loadRangeData } from './dashboard.service';

/** Everything for one business day (Asia/Manila by default). Staff history is limited; future dates are allowed for deliveries. */
export async function getDaily(date: string, role: 'ADMIN' | 'STAFF') {
  const ymd = parseYmd(date);
  if (!ymd) throw new HttpError(400, 'Choose a valid date.');
  if (role === 'STAFF' && diffDays(ymd, localYmd(new Date())) > STAFF_HISTORY_DAYS) {
    throw new HttpError(403, `Staff can look back up to ${STAFF_HISTORY_DAYS} days. Ask the Admin for older records.`);
  }
  const range = resolveRange('custom', { from: date, to: date });
  const inRange = { gte: range.start, lt: range.end };
  const [data, sales, payments, expenses, deliveries] = await Promise.all([
    loadRangeData(range),
    prisma.sale.findMany({
      where: { createdAt: inRange },
      include: { items: true, payments: { select: { paymentMethod: true, status: true } }, customer: { select: { id: true, name: true } }, staff: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.findMany({
      where: { createdAt: inRange },
      include: { customer: { select: { name: true } }, receivedBy: { select: { name: true } }, sale: { select: { transactionNumber: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.expense.findMany({ where: { incurredAt: inRange }, include: { staff: { select: { name: true } } }, orderBy: { incurredAt: 'desc' } }),
    prisma.delivery.findMany({ where: { scheduledAt: inRange }, include: { customer: { select: { name: true, phone: true } }, items: true }, orderBy: { scheduledAt: 'asc' } }),
  ]);
  const summary = summarize(data);
  const products = productBreakdown(data);
  const pick = (n: string) => products.find((p) => p.name.toLowerCase() === n) ?? { name: n, amount: 0, quantity: 0, sacks: 0, transactions: 0 };
  const gcash = data.payments.filter((p) => p.method === 'GCASH').reduce((a, p) => a + p.amount, 0);
  const cash = data.payments.filter((p) => p.method === 'CASH').reduce((a, p) => a + p.amount, 0);
  const count = (s: string) => deliveries.filter((d) => d.status === s).length;
  return {
    date,
    summary: {
      ...summary,
      cashOnly: Math.round(cash * 100) / 100,
      gcashAndDigital: Math.round((summary.cashCollections - cash) * 100) / 100,
      gcashOnly: Math.round(gcash * 100) / 100,
    },
    tubeIce: pick('tube ice'),
    crushedIce: pick('crushed ice'),
    deliveryCounts: { delivered: count('DELIVERED'), pending: count('PENDING') + count('ASSIGNED') + count('OUT_FOR_DELIVERY'), cancelled: count('CANCELLED'), failed: count('FAILED'), total: deliveries.length },
    sales,
    payments,
    expenses,
    deliveries: deliveries.map((d) => ({ ...d, itemsTotal: d.items.reduce((a, i) => a + num(i.lineTotal), 0) })),
  };
}
