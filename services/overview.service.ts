import { prisma } from '@/lib/db/prisma';
import { num, sum } from '@/lib/money';
import { resolveRange, type Period } from '@/lib/date';

export type OverviewStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export interface OverviewFilters {
  period: Period | 'all';
  from?: string | null;
  to?: string | null;
  status?: OverviewStatus | null;
  method?: string | null;
  q?: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Payment overview for Admin and Staff. Only confirmed (ACTIVE) payment records count as money collected.
 * Records = completed sales (with their customer) + delivery orders that have no sale yet (nothing paid, not cancelled).
 */
export async function paymentOverview(f: OverviewFilters) {
  const range = f.period === 'all' ? null : resolveRange(f.period, { from: f.from, to: f.to });
  const q = f.q?.trim().toLowerCase();

  const [sales, openOrders, payments, debt] = await Promise.all([
    prisma.sale.findMany({
      where: { status: 'COMPLETED', ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}) },
      select: {
        id: true, transactionNumber: true, createdAt: true, totalAmount: true, amountPaid: true, paymentStatus: true,
        customer: { select: { id: true, name: true, phone: true } },
        delivery: { select: { orderNumber: true } },
        allocations: { where: { payment: { status: 'ACTIVE' } }, select: { allocatedAmount: true, payment: { select: { paymentMethod: true, createdAt: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.delivery.findMany({
      where: { saleId: null, status: { not: 'CANCELLED' }, ...(range ? { scheduledAt: { gte: range.start, lt: range.end } } : {}) },
      select: { id: true, orderNumber: true, scheduledAt: true, deliveryFee: true, customer: { select: { id: true, name: true, phone: true } }, items: { select: { lineTotal: true } } },
      take: 500,
    }),
    // money actually collected in the period, by method
    prisma.payment.findMany({
      where: { status: 'ACTIVE', ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}) },
      select: { amount: true, paymentMethod: true, paymentType: true },
    }),
    prisma.ledgerEntry.aggregate({ _sum: { amount: true } }),
  ]);

  type Rec = {
    key: string; kind: 'SALE' | 'ORDER'; reference: string; deliveryRef: string | null; date: Date;
    customerId: string | null; customer: string; phone: string | null;
    total: number; paid: number; balance: number; status: OverviewStatus;
    methods: { method: string; amount: number }[]; lastPaymentAt: Date | null;
  };
  const recs: Rec[] = [];
  for (const s of sales) {
    const m = new Map<string, number>();
    let last: Date | null = null;
    for (const a of s.allocations) {
      m.set(a.payment.paymentMethod, (m.get(a.payment.paymentMethod) ?? 0) + num(a.allocatedAmount));
      if (!last || a.payment.createdAt > last) last = a.payment.createdAt;
    }
    const total = num(s.totalAmount), paid = num(s.amountPaid);
    recs.push({
      key: s.id, kind: 'SALE', reference: s.transactionNumber, deliveryRef: s.delivery?.orderNumber ?? null, date: s.createdAt,
      customerId: s.customer?.id ?? null, customer: s.customer?.name ?? 'Walk-in', phone: s.customer?.phone ?? null,
      total, paid, balance: r2(total - paid), status: s.paymentStatus as OverviewStatus,
      methods: [...m.entries()].map(([method, amount]) => ({ method, amount: r2(amount) })), lastPaymentAt: last,
    });
  }
  for (const o of openOrders) {
    const total = num(sum(o.items.map((i) => i.lineTotal)).plus(o.deliveryFee));
    recs.push({
      key: o.id, kind: 'ORDER', reference: o.orderNumber, deliveryRef: o.orderNumber, date: o.scheduledAt,
      customerId: o.customer.id, customer: o.customer.name, phone: o.customer.phone,
      total, paid: 0, balance: total, status: 'UNPAID', methods: [], lastPaymentAt: null,
    });
  }

  const filtered = recs
    .filter((r) => !f.status || r.status === f.status)
    .filter((r) => !f.method || r.methods.some((m) => m.method === f.method))
    .filter((r) => !q || r.customer.toLowerCase().includes(q) || (r.phone ?? '').includes(q) || r.reference.toLowerCase().includes(q))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const collected = (pred: (p: (typeof payments)[number]) => boolean) => r2(payments.filter(pred).reduce((a, p) => a + num(p.amount), 0));
  const totals = {
    unpaidAmount: r2(recs.filter((r) => r.status === 'UNPAID').reduce((a, r) => a + r.balance, 0)),
    partialBalance: r2(recs.filter((r) => r.status === 'PARTIAL').reduce((a, r) => a + r.balance, 0)),
    paidAmount: r2(recs.filter((r) => r.status === 'PAID').reduce((a, r) => a + r.total, 0)),
    gcashCollected: collected((p) => p.paymentMethod === 'GCASH'),
    cashCollected: collected((p) => p.paymentMethod === 'CASH'),
    otherDigitalCollected: collected((p) => p.paymentMethod !== 'CASH' && p.paymentMethod !== 'GCASH'),
    // value of orders that were (at least partly) paid by GCash, as opposed to GCash money actually collected in the period
    gcashOrderValue: r2(recs.filter((r) => r.methods.some((m) => m.method === 'GCASH')).reduce((a, r) => a + r.total, 0)),
    outstandingDebt: num(debt._sum.amount),
  };
  return { range: range ? { start: range.start, end: range.end, label: range.label } : { label: 'All dates' }, totals, rows: filtered.slice(0, 300), total: filtered.length };
}
