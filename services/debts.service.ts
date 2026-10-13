import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { ZERO, D, num, type Dec } from '@/lib/money';
import { audit } from '@/lib/audit';
import { resolveRange, type Period } from '@/lib/date';
import { balanceOf } from './payments.service';

export type AccountStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

interface Agg {
  charges: Dec;
  payments: Dec;
  adjustments: Dec;
  balance: Dec;
  lastPurchase: Date | null;
  lastPurchaseAmount: Dec | null;
  lastPayment: Date | null;
  chargesInRange: boolean;
}

export async function debtorTable(f: { q?: string | null; period?: Period | null; from?: string | null; to?: string | null; outstandingOnly?: boolean }) {
  const range = f.period ? resolveRange(f.period, { from: f.from, to: f.to }) : null;
  const entries = await prisma.ledgerEntry.findMany({
    select: { customerId: true, type: true, amount: true, createdAt: true, sale: { select: { status: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const map = new Map<string, Agg>();
  for (const e of entries) {
    const a =
      map.get(e.customerId) ??
      { charges: ZERO, payments: ZERO, adjustments: ZERO, balance: ZERO, lastPurchase: null, lastPurchaseAmount: null, lastPayment: null, chargesInRange: false };
    a.balance = a.balance.plus(e.amount);
    if (e.type === 'CHARGE') {
      a.charges = a.charges.plus(e.amount);
      a.lastPurchase = e.createdAt;
      a.lastPurchaseAmount = e.amount;
      if (range && e.createdAt >= range.start && e.createdAt < range.end && e.sale?.status === 'COMPLETED') a.chargesInRange = true;
    } else if (e.type === 'PAYMENT') {
      a.payments = a.payments.plus(e.amount.neg());
      a.lastPayment = e.createdAt;
    } else if (e.type === 'ADJUSTMENT') {
      a.adjustments = a.adjustments.plus(e.amount);
    } else if (e.type === 'REVERSAL') {
      // reversal of a charge is negative (reduces charges); reversal of a payment is positive (reduces payments)
      if (e.amount.lt(0)) a.charges = a.charges.plus(e.amount);
      else a.payments = a.payments.minus(e.amount);
    }
    map.set(e.customerId, a);
  }
  const customers = await prisma.customer.findMany({ where: { id: { in: [...map.keys()] } }, select: { id: true, name: true, phone: true } });
  const q = f.q?.trim().toLowerCase();
  const rows = customers
    .map((c) => {
      const a = map.get(c.id)!;
      const status: AccountStatus = a.balance.gt(0) ? (a.payments.gt(0) ? 'PARTIAL' : 'UNPAID') : 'PAID';
      return {
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        totalCharges: a.charges,
        totalPayments: a.payments,
        adjustments: a.adjustments,
        balance: a.balance,
        lastPurchase: a.lastPurchase,
        lastPurchaseAmount: a.lastPurchaseAmount,
        lastPayment: a.lastPayment,
        status,
        _inRange: a.chargesInRange,
      };
    })
    .filter((r) => (!q || r.name.toLowerCase().includes(q) || r.phone.includes(q)) && (!f.outstandingOnly || r.balance.gt(0)) && (!range || r._inRange))
    .sort((a, b) => b.balance.comparedTo(a.balance))
    .map(({ _inRange, ...r }) => r);
  return rows;
}

export async function debtCards() {
  const today = resolveRange('today');
  const month = resolveRange('month');
  const [outstanding, chargesToday, chargesMonth, payToday, payMonth, table] = await Promise.all([
    prisma.ledgerEntry.aggregate({ _sum: { amount: true } }),
    sumCharges(today.start, today.end),
    sumCharges(month.start, month.end),
    sumDebtPayments(today.start, today.end),
    sumDebtPayments(month.start, month.end),
    debtorTable({}),
  ]);
  return {
    totalOutstanding: outstanding._sum.amount ?? ZERO,
    creditSalesToday: chargesToday,
    creditSalesMonth: chargesMonth,
    debtPaymentsToday: payToday,
    debtPaymentsMonth: payMonth,
    customersWithBalance: table.filter((r) => r.balance.gt(0)).length,
    fullyPaidAccounts: table.filter((r) => r.status === 'PAID' && r.totalCharges.gt(0)).length,
    partiallyPaidAccounts: table.filter((r) => r.status === 'PARTIAL').length,
  };
}

export async function sumCharges(start: Date, end: Date) {
  const rows = await prisma.ledgerEntry.findMany({ where: { type: 'CHARGE', createdAt: { gte: start, lt: end }, sale: { status: 'COMPLETED' } }, select: { amount: true } });
  return rows.reduce((a, r) => a.plus(r.amount), ZERO);
}
export async function sumDebtPayments(start: Date, end: Date) {
  const r = await prisma.payment.aggregate({ where: { paymentType: 'DEBT_PAYMENT', status: 'ACTIVE', createdAt: { gte: start, lt: end } }, _sum: { amount: true } });
  return r._sum.amount ?? ZERO;
}

/** Full auditable ledger with a running balance, plus the arithmetic behind the balance. */
export async function customerLedger(customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true, address: true } });
  if (!customer) throw new HttpError(404, 'Customer not found.');
  const entries = await prisma.ledgerEntry.findMany({
    where: { customerId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      recordedBy: { select: { name: true } },
      sale: { select: { transactionNumber: true } },
      payment: { select: { paymentReference: true, paymentMethod: true } },
    },
  });
  let running = ZERO;
  const rows = entries.map((e) => {
    running = running.plus(e.amount);
    return { ...e, runningBalance: running };
  });
  const by = (t: string, pred: (a: Dec) => boolean = () => true) => entries.filter((e) => e.type === t && pred(e.amount)).reduce((a, e) => a.plus(e.amount), ZERO);
  const summary = {
    charges: by('CHARGE'),
    payments: by('PAYMENT').neg(),
    adjustments: by('ADJUSTMENT'),
    chargeReversals: by('REVERSAL', (a) => a.lt(0)),
    paymentReversals: by('REVERSAL', (a) => a.gt(0)),
    balance: running,
  };
  return { customer, summary, entries: rows.reverse() };
}

export async function adjustDebt(customerId: string, amount: string, note: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
    const c = await tx.customer.findUnique({ where: { id: customerId } });
    if (!c) throw new HttpError(404, 'Customer not found.');
    const bal = await balanceOf(tx, customerId);
    const amt = D(amount);
    if (bal.plus(amt).lt(0)) throw new HttpError(400, 'This adjustment would make the balance negative.');
    const e = await tx.ledgerEntry.create({ data: { customerId, type: 'ADJUSTMENT', amount: amt, note, recordedById: actorId } });
    await audit(tx, { actorId, action: 'DEBT_ADJUSTMENT', entityType: 'LedgerEntry', entityId: e.id, newValues: { customerId, amount: amt, note, previousBalance: bal } });
    return { entry: e, balance: bal.plus(amt) };
  });
}

export { num };
