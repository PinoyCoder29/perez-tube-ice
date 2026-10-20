import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D, ZERO, sum, type Dec } from '@/lib/money';
import { audit } from '@/lib/audit';
import { listDeliveries } from './deliveries.service';

export async function balancesFor(ids: string[]): Promise<Map<string, Dec>> {
  const m = new Map<string, Dec>();
  if (!ids.length) return m;
  const g = await prisma.ledgerEntry.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _sum: { amount: true } });
  for (const r of g) m.set(r.customerId, r._sum.amount ?? ZERO);
  return m;
}

export async function listCustomers(opts: { q?: string | null; includeInactive?: boolean; take?: number; skip?: number }) {
  const q = opts.q?.trim();
  const where: Prisma.CustomerWhereInput = {
    ...(opts.includeInactive ? {} : { active: true }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q.replace(/[\s\-]/g, '') } },
            { address: { contains: q, mode: 'insensitive' } },
            { landmark: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({ where, orderBy: { name: 'asc' }, take: opts.take ?? 30, skip: opts.skip ?? 0 }),
  ]);
  const ids = customers.map((c) => c.id);
  const [balances, purchases] = await Promise.all([
    balancesFor(ids),
    ids.length
      ? prisma.sale.groupBy({
          by: ['customerId'],
          where: { customerId: { in: ids }, status: 'COMPLETED' },
          _sum: { totalAmount: true },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const pm = new Map(purchases.map((p) => [p.customerId, p]));
  const dstats = ids.length
    ? await prisma.delivery.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: 'DELIVERED' }, _count: true, _max: { deliveredAt: true } })
    : [];
  const dm = new Map(dstats.map((x) => [x.customerId, x]));
  const byType = ids.length ? await prisma.ledgerEntry.groupBy({ by: ['customerId', 'type'], where: { customerId: { in: ids } }, _sum: { amount: true } }) : [];
  const sumOf = (cid: string, t: string) => byType.find((x) => x.customerId === cid && x.type === t)?._sum.amount ?? ZERO;
  return {
    total,
    rows: customers.map((c) => ({
      ...c,
      outstandingBalance: balances.get(c.id) ?? ZERO,
      // Text status for the customer's account: Unpaid / Partially paid / Paid (null = never bought on credit)
      accountStatus: ((balances.get(c.id) ?? ZERO).gt(0)
        ? (sumOf(c.id, 'PAYMENT').lt(0) ? 'PARTIAL' : 'UNPAID')
        : sumOf(c.id, 'CHARGE').gt(0) ? 'PAID' : null) as 'UNPAID' | 'PARTIAL' | 'PAID' | null,
      totalPurchases: pm.get(c.id)?._sum.totalAmount ?? ZERO,
      lastTransactionAt: pm.get(c.id)?._max.createdAt ?? null,
      completedDeliveries: dm.get(c.id)?._count ?? 0,
      lastDeliveryAt: dm.get(c.id)?._max.deliveredAt ?? null,
    })),
  };
}

export async function getCustomerDetail(id: string, opts: { hideNotes?: boolean } = {}) {
  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Customer not found.');
  const [balances, sales, payments, deliveryList] = await Promise.all([
    balancesFor([id]),
    prisma.sale.findMany({ where: { customerId: id }, include: { items: true, payments: { select: { paymentMethod: true, status: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.payment.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 100, include: { sale: { select: { transactionNumber: true } } } }),
    listDeliveries({ customerId: id, all: true }),
  ]);
  const credit = await prisma.ledgerEntry.findMany({
    where: { customerId: id, type: 'CHARGE' },
    include: { sale: { select: { id: true, transactionNumber: true, totalAmount: true, amountPaid: true, paymentStatus: true, status: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const completed = sales.filter((s) => s.status === 'COMPLETED');
  const totalPurchases = sum(completed.map((s) => s.totalAmount));
  const active = payments.filter((p) => p.status === 'ACTIVE');
  const totalPayments = sum(active.map((p) => p.amount));
  const cashCollected = sum(active.filter((p) => p.paymentMethod === 'CASH').map((p) => p.amount));
  const gcashCollected = sum(active.filter((p) => p.paymentMethod === 'GCASH').map((p) => p.amount));
  const debtPayments = sum(active.filter((p) => p.paymentType === 'DEBT_PAYMENT').map((p) => p.amount));
  return {
    customer: opts.hideNotes ? { ...c, notes: null } : c,
    summary: { totalPurchases, totalPayments, cashCollected, gcashCollected, debtPayments, outstandingBalance: balances.get(id) ?? ZERO, lastTransactionAt: completed[0]?.createdAt ?? null },
    sales,
    payments,
    deliveries: deliveryList.rows,
    creditPurchases: credit.map((c) => ({ id: c.id, createdAt: c.createdAt, charged: c.amount, sale: c.sale })),
  };
}

export async function createCustomer(data: { name: string; phone: string; address: string; landmark: string | null; notes: string | null }, actorId: string) {
  const c = await prisma.customer.create({ data });
  await audit(prisma, { actorId, action: 'CUSTOMER_CREATE', entityType: 'Customer', entityId: c.id, newValues: data });
  return c;
}

/** Admin only. Creates the customer and their configured prices atomically; both are immediately visible to Staff. */
export async function createCustomerWithPrices(
  data: { name: string; phone: string; address: string; landmark: string | null; notes: string | null },
  prices: { priceOptionId: string; sellingPrice: string; minQuantity: number }[],
  adminId: string,
) {
  const seen = new Set<string>();
  for (const p of prices) {
    const k = `${p.priceOptionId}:${p.minQuantity}`;
    if (seen.has(k)) throw new HttpError(400, 'The same package and quantity rule was listed twice.');
    seen.add(k);
  }
  return prisma.$transaction(async (tx) => {
    if (prices.length) {
      const found = await tx.priceOption.count({ where: { id: { in: [...new Set(prices.map((p) => p.priceOptionId))] } } });
      if (found !== new Set(prices.map((p) => p.priceOptionId)).size) throw new HttpError(400, 'One of the packages no longer exists. Refresh and try again.');
    }
    const c = await tx.customer.create({ data });
    for (const p of prices) {
      const price = D(p.sellingPrice);
      await tx.customerPrice.create({
        data: {
          customerId: c.id, priceOptionId: p.priceOptionId, sellingPrice: price, minQuantity: p.minQuantity, createdById: adminId, updatedById: adminId,
          history: { create: { newPrice: price, newActive: true, newMinQuantity: p.minQuantity, changedById: adminId } },
        },
      });
    }
    await audit(tx, { actorId: adminId, action: 'CUSTOMER_CREATE', entityType: 'Customer', entityId: c.id, newValues: { ...data, priceCount: prices.length } });
    return c;
  });
}

export async function updateCustomer(id: string, data: { name: string; phone: string; address: string; landmark: string | null; notes: string | null; active?: boolean }, actorId: string) {
  const before = await prisma.customer.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Customer not found.');
  const c = await prisma.customer.update({ where: { id }, data });
  await audit(prisma, { actorId, action: 'CUSTOMER_UPDATE', entityType: 'Customer', entityId: id, previousValues: before, newValues: c });
  return c;
}
