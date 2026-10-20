import crypto from 'crypto';
import { DeliveryStatus, DeliveryPaymentType, PaymentMethod, Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D, num, sum } from '@/lib/money';
import { audit } from '@/lib/audit';
import { zonedTimeToUtc, getTimezone, resolveRange, parseYmd } from '@/lib/date';
import { STAFF_USERNAME } from '@/lib/constants';
import type { Actor } from '@/lib/auth';
import { createSaleTx, nextReference, voidSaleTx } from './sales.service';
import { resolveLinePrice } from './pricing.service';
import { getSettings } from './settings.service';
import { isUniqueViolation } from '@/lib/api';
import { recordDebtPaymentTx } from './payments.service';

export interface OrderItemInput {
  priceOptionId?: string;
  productId?: string;
  customUnitPrice?: string;
  quantity: number;
}

export interface DeliveryInput {
  customerId: string;
  idempotencyKey?: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  items: OrderItemInput[];
  deliveryFee?: string;
  paymentType: DeliveryPaymentType;
  instructions?: string | null;
  /** Address for THIS order only; the customer's profile address is never changed by it. */
  deliveryAddress?: string | null;
  assign?: boolean;
  /** Optional payment arrangement recorded together with the order (Paid Cash / Paid GCash / Partial). */
  payment?: (DeliveryPaymentLine & { idempotencyKey: string }) | null;
}

export interface DeliveryPaymentLine {
  method: PaymentMethod;
  amount: string;
  reference?: string | null;
  notes?: string | null;
}

const OPEN: DeliveryStatus[] = ['PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY'];

function schedule(date: string, time?: string | null) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time ? time.split(':').map(Number) : [0, 0];
  return { scheduledAt: zonedTimeToUtc(y, m, d, h, mi, getTimezone()), hasTime: !!time };
}

/**
 * Prices every line ON THE SERVER: customer-specific price (with quantity rule) > standard package price > rejected.
 * Quantities for the same package are merged first so a quantity-based rule sees the real total.
 * Custom lines need permission and respect the configured maximum.
 */
async function buildItems(tx: Tx, customerId: string, items: OrderItemInput[], opts: { allowCustom: boolean }) {
  const qty = new Map<string, number>();
  const custom: OrderItemInput[] = [];
  for (const i of items) {
    if (i.priceOptionId) qty.set(i.priceOptionId, (qty.get(i.priceOptionId) ?? 0) + i.quantity);
    else custom.push(i);
  }
  const rows: Prisma.DeliveryItemCreateWithoutDeliveryInput[] = [];
  for (const [priceOptionId, quantity] of qty) {
    const r = await resolveLinePrice(tx, { customerId, priceOptionId, quantity });
    rows.push({
      product: { connect: { id: r.option.productId } },
      priceOption: { connect: { id: r.option.id } },
      productNameSnapshot: r.option.product.name,
      packageTypeSnapshot: r.option.packageType,
      labelSnapshot: r.option.label,
      unitPrice: r.unitPrice,
      quantity,
      lineTotal: r.unitPrice.mul(quantity),
      pricingSource: r.source,
      customerPriceId: r.customerPriceId,
    });
  }
  if (custom.length) {
    if (!opts.allowCustom) throw new HttpError(403, 'Custom prices are not allowed for this user.');
    const settings = await getSettings(tx);
    for (const c of custom) {
      const p = await tx.product.findUnique({ where: { id: c.productId! } });
      if (!p || !p.active) throw new HttpError(400, 'Custom price: product not found or inactive.');
      const price = D(c.customUnitPrice!);
      if (price.lte(0)) throw new HttpError(400, 'Custom price must be greater than zero.');
      if (price.gt(settings.customPriceMax)) throw new HttpError(400, `Custom price is above the allowed maximum of ${settings.customPriceMax}.`);
      rows.push({
        product: { connect: { id: p.id } },
        productNameSnapshot: p.name,
        packageTypeSnapshot: 'CUSTOM',
        labelSnapshot: `Custom ₱${price.toFixed(2)}`,
        unitPrice: price,
        quantity: c.quantity,
        lineTotal: price.mul(c.quantity),
        pricingSource: 'CUSTOM',
        isCustomPrice: true,
      });
    }
  }
  return rows;
}

async function staffUserId(tx: Tx): Promise<string> {
  const s = await tx.user.findUnique({ where: { username: STAFF_USERNAME } });
  if (!s) throw new HttpError(503, 'Staff identity is not set up. Run the database seed.');
  return s.id;
}

export const deliveryInclude = {
  customer: { select: { id: true, name: true, phone: true, address: true, landmark: true } },
  items: true,
  assignedStaff: { select: { name: true } },
  sale: {
    select: {
      id: true,
      transactionNumber: true,
      totalAmount: true,
      amountPaid: true,
      paymentStatus: true,
      status: true,
      allocations: {
        where: { payment: { status: 'ACTIVE' } },
        select: { allocatedAmount: true, payment: { select: { paymentMethod: true, createdAt: true, reference: true } } },
      },
    },
  },
} satisfies Prisma.DeliveryInclude;

type DeliveryRow = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

/**
 * Creates a delivery order directly (Staff or Admin; no assignment step). It creates NO sale, payment, debt or stock movement by itself —
 * those only appear when money is recorded or the order is delivered. An optional first payment is recorded in the same transaction.
 */
export async function createDeliveryTx(tx: Tx, input: DeliveryInput, actor: Actor, opts: { allowCustom: boolean }) {
  if (input.idempotencyKey) {
    const seen = await tx.delivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (seen) return { delivery: await getDeliveryTx(tx, seen.id), duplicate: true };
  }
  const c = await tx.customer.findUnique({ where: { id: input.customerId } });
  if (!c || !c.active) throw new HttpError(400, 'Customer not found or inactive.');
  const items = await buildItems(tx, c.id, input.items, opts);
  const itemsTotal = sum(items.map((i) => i.lineTotal as Prisma.Decimal));
  const fee = D(input.deliveryFee ?? 0);
  const { scheduledAt, hasTime } = schedule(input.scheduledDate, input.scheduledTime);
  const address = input.deliveryAddress?.trim() || (c.landmark ? `${c.address} (${c.landmark})` : c.address);
  const d = await tx.delivery.create({
    data: {
      orderNumber: await nextReference(tx, 'DL'),
      idempotencyKey: input.idempotencyKey ?? null,
      customerId: c.id,
      customerNameSnapshot: c.name,
      addressSnapshot: address,
      phoneSnapshot: c.phone,
      scheduledAt,
      hasTime,
      deliveryFee: fee,
      orderTotal: itemsTotal.plus(fee),
      paymentType: input.paymentType,
      instructions: input.instructions ?? null,
      status: input.assign ? 'ASSIGNED' : 'PENDING',
      assignedStaffId: input.assign ? await staffUserId(tx) : null,
      createdById: actor.id,
      items: { create: items },
    },
  });
  await audit(tx, {
    actorId: actor.id,
    action: 'DELIVERY_CREATE',
    entityType: 'Delivery',
    entityId: d.id,
    newValues: { orderNumber: d.orderNumber, customerId: c.id, total: d.orderTotal, sources: items.map((i) => i.pricingSource) },
  });
  if (input.payment) await recordDeliveryPaymentTx(tx, d.id, input.payment, actor);
  return { delivery: await getDeliveryTx(tx, d.id), duplicate: false };
}

export async function createDelivery(input: DeliveryInput, actor: Actor, opts: { allowCustom: boolean }) {
  try {
    return await prisma.$transaction((tx) => createDeliveryTx(tx, input, actor, opts), { timeout: 20000 });
  } catch (e) {
    if (input.idempotencyKey && isUniqueViolation(e)) {
      const seen = await prisma.delivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (seen) return { delivery: await prisma.$transaction((tx) => getDeliveryTx(tx, seen.id)), duplicate: true };
    }
    throw e;
  }
}

export async function updateDelivery(id: string, patch: Partial<Omit<DeliveryInput, 'payment' | 'customerId'>>, actor: Actor, opts: { allowCustom: boolean }) {
  return prisma.$transaction(async (tx) => {
    const d = await tx.delivery.findUnique({ where: { id }, include: { items: true } });
    if (!d) throw new HttpError(404, 'Delivery not found.');
    if (['DELIVERED', 'CANCELLED'].includes(d.status) || d.saleId) throw new HttpError(409, 'Orders that are completed, cancelled, or already invoiced cannot be edited.');
    const data: Prisma.DeliveryUpdateInput = {};
    if (patch.scheduledDate) Object.assign(data, schedule(patch.scheduledDate, patch.scheduledTime));
    if (patch.instructions !== undefined) data.instructions = patch.instructions;
    if (patch.deliveryAddress) data.addressSnapshot = patch.deliveryAddress.trim();
    if (patch.paymentType) data.paymentType = patch.paymentType;
    let itemsTotal = sum(d.items.map((i) => i.lineTotal));
    if (patch.items) {
      const items = await buildItems(tx, d.customerId, patch.items, opts);
      await tx.deliveryItem.deleteMany({ where: { deliveryId: id } });
      data.items = { create: items };
      itemsTotal = sum(items.map((i) => i.lineTotal as Prisma.Decimal));
    }
    const fee = patch.deliveryFee !== undefined ? D(patch.deliveryFee) : d.deliveryFee;
    data.deliveryFee = fee;
    data.orderTotal = itemsTotal.plus(fee);
    await tx.delivery.update({ where: { id }, data });
    await audit(tx, { actorId: actor.id, action: 'DELIVERY_UPDATE', entityType: 'Delivery', entityId: id, previousValues: d, newValues: patch });
    return getDeliveryTx(tx, id);
  });
}

function itemsAsSale(d: { items: { priceOptionId: string | null; productId: string; quantity: number; unitPrice: Prisma.Decimal; isCustomPrice: boolean; pricingSource: string; customerPriceId: string | null }[] }) {
  return d.items.map((i) =>
    i.isCustomPrice || !i.priceOptionId
      ? { productId: i.productId, customUnitPrice: i.unitPrice.toFixed(2), quantity: i.quantity, pricingSource: 'CUSTOM' }
      : { priceOptionId: i.priceOptionId, quantity: i.quantity, unitPriceOverride: i.unitPrice, pricingSource: i.pricingSource, customerPriceId: i.customerPriceId },
  );
}

/** Records money against a delivery order. The first payment creates the order's sale; later ones are debt-style payments on that sale. */
export async function recordDeliveryPaymentTx(tx: Tx, id: string, body: { idempotencyKey: string } & DeliveryPaymentLine, actor: Actor) {
  await tx.$queryRaw`SELECT id FROM "Delivery" WHERE id = ${id} FOR UPDATE`;
  const seen = await tx.payment.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
  if (seen) return { delivery: await getDeliveryTx(tx, id), duplicate: true };

  const d = await tx.delivery.findUnique({ where: { id }, include: { items: true, sale: true } });
  if (!d) throw new HttpError(404, 'Delivery not found.');
  if (d.status === 'CANCELLED') throw new HttpError(409, 'This order was cancelled.');
  const total = d.orderTotal;
  const amount = D(body.amount);

  if (!d.saleId) {
    if (amount.gt(total)) throw new HttpError(400, `Payment is more than the order total (${total.toFixed(2)}).`);
    const sale = await createSaleTx(
      tx,
      {
        customerId: d.customerId,
        items: itemsAsSale(d),
        payments: [{ method: body.method, amount: body.amount, reference: body.reference, notes: body.notes, idempotencyKey: body.idempotencyKey }],
        deliveryFee: d.deliveryFee.toString(),
        notes: `Delivery ${d.orderNumber}`,
      },
      actor.id,
      { allowInactive: true, allowCustom: true },
    );
    await tx.delivery.update({ where: { id }, data: { saleId: sale.id } });
  } else {
    if (d.sale!.status === 'VOIDED') throw new HttpError(409, 'The sale linked to this order was voided. Ask the Admin.');
    await recordDebtPaymentTx(tx, { idempotencyKey: body.idempotencyKey, customerId: d.customerId, amount: body.amount, method: body.method, notes: body.notes, reference: body.reference, saleId: d.saleId }, actor.id);
  }
  await audit(tx, { actorId: actor.id, action: 'DELIVERY_PAYMENT', entityType: 'Delivery', entityId: id, newValues: { amount, method: body.method, reference: body.reference } });
  return { delivery: await getDeliveryTx(tx, id), duplicate: false };
}

export async function recordDeliveryPayment(id: string, body: { idempotencyKey: string } & DeliveryPaymentLine, actor: Actor) {
  return prisma.$transaction((tx) => recordDeliveryPaymentTx(tx, id, body, actor), { timeout: 20000 });
}

async function getDeliveryTx(tx: Tx, id: string) {
  const d = await tx.delivery.findUniqueOrThrow({ where: { id }, include: deliveryInclude });
  return derive(d, new Map());
}

const FROM: Record<string, DeliveryStatus[]> = {
  ASSIGNED: ['PENDING', 'FAILED'],
  OUT_FOR_DELIVERY: ['PENDING', 'ASSIGNED'],
  FAILED: ['PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY'],
  PENDING: ['ASSIGNED', 'FAILED'],
};

export async function changeDeliveryStatus(
  id: string,
  body: { status: DeliveryStatus; reason?: string | null; payments?: DeliveryPaymentLine[]; idempotencyKey?: string },
  actor: Actor,
) {
  const { status } = body;
  if (['PENDING', 'ASSIGNED'].includes(status) && actor.role !== 'ADMIN') throw new HttpError(403, 'Only Admin can do that.');
  if ((status === 'FAILED' || status === 'CANCELLED') && !body.reason) throw new HttpError(400, 'Please give a reason.');

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Delivery" WHERE id = ${id} FOR UPDATE`;
      const d0 = await tx.delivery.findUnique({ where: { id }, include: { items: true, sale: true } });
      if (!d0) throw new HttpError(404, 'Delivery not found.');

      if (status === 'DELIVERED') {
        if (!OPEN.includes(d0.status)) throw new HttpError(409, 'This delivery cannot be completed (already delivered, failed, or cancelled).');
        const staffId = d0.assignedStaffId ?? (actor.role === 'STAFF' ? actor.id : await staffUserId(tx));
        await tx.delivery.update({ where: { id }, data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredById: actor.id, assignedStaffId: staffId } });
        const key = body.idempotencyKey ?? crypto.randomUUID();
        const pays = body.payments ?? [];
        // Delivery never marks anything paid by itself: only the payment records below do.
        if (!d0.saleId) {
          const sale = await createSaleTx(
            tx,
            {
              customerId: d0.customerId,
              items: itemsAsSale(d0),
              payments: pays.map((p, i) => ({ ...p, idempotencyKey: `${key}:${i}` })),
              deliveryFee: d0.deliveryFee.toString(),
              notes: `Delivery ${d0.orderNumber}`,
            },
            actor.id,
            { allowInactive: true, allowCustom: true },
          );
          await tx.delivery.update({ where: { id }, data: { saleId: sale.id } });
        } else {
          if (d0.sale!.status === 'VOIDED') throw new HttpError(409, 'The sale linked to this order was voided. Ask the Admin.');
          for (const [i, p] of pays.entries()) {
            await recordDebtPaymentTx(tx, { idempotencyKey: `${key}:${i}`, customerId: d0.customerId, amount: p.amount, method: p.method, notes: p.notes, reference: p.reference, saleId: d0.saleId }, actor.id);
          }
        }
        await audit(tx, { actorId: actor.id, action: 'DELIVERY_COMPLETE', entityType: 'Delivery', entityId: id, newValues: { payments: pays } });
        return getDeliveryTx(tx, id);
      }

      if (status === 'CANCELLED') {
        if (d0.status === 'DELIVERED') throw new HttpError(409, 'A delivered order cannot be cancelled here. Ask the Admin to reverse it.');
        if (d0.status === 'CANCELLED') throw new HttpError(409, 'Already cancelled.');
        let voidedSale = false;
        if (d0.saleId && d0.sale!.status === 'COMPLETED') {
          await voidSaleTx(tx, d0.saleId, `Order ${d0.orderNumber} cancelled: ${body.reason}`, actor.id, { cascadeDebtPayments: true });
          voidedSale = true;
        }
        await tx.delivery.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: body.reason, cancelledAt: new Date(), cancelledById: actor.id } });
        await audit(tx, { actorId: actor.id, action: 'DELIVERY_CANCEL', entityType: 'Delivery', entityId: id, previousValues: { status: d0.status }, newValues: { status: 'CANCELLED', reason: body.reason, saleReversed: voidedSale } });
        return getDeliveryTx(tx, id);
      }

      if (!FROM[status]?.includes(d0.status)) throw new HttpError(409, `Cannot move this delivery from ${d0.status.toLowerCase().replace(/_/g, ' ')} to ${status.toLowerCase().replace(/_/g, ' ')}.`);
      const data: Prisma.DeliveryUpdateInput = { status, statusReason: body.reason ?? null };
      if (status === 'ASSIGNED' || status === 'OUT_FOR_DELIVERY') data.assignedStaff = { connect: { id: await staffUserId(tx) } };
      if (status === 'PENDING') data.assignedStaff = { disconnect: true };
      await tx.delivery.update({ where: { id }, data });
      await audit(tx, { actorId: actor.id, action: 'DELIVERY_STATUS', entityType: 'Delivery', entityId: id, previousValues: { status: d0.status }, newValues: { status, reason: body.reason } });
      return getDeliveryTx(tx, id);
    },
    { timeout: 20000 },
  );
}

/** Admin-controlled correction for an order that was already delivered: reverses the sale/payments and marks the order cancelled. */
export async function reverseDelivery(id: string, reason: string, actorId: string) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Delivery" WHERE id = ${id} FOR UPDATE`;
      const d = await tx.delivery.findUnique({ where: { id }, include: { sale: true } });
      if (!d) throw new HttpError(404, 'Delivery not found.');
      if (d.status !== 'DELIVERED') throw new HttpError(409, 'Only delivered orders need a reversal.');
      if (d.saleId && d.sale!.status === 'COMPLETED') await voidSaleTx(tx, d.saleId, `Delivery ${d.orderNumber} reversed: ${reason}`, actorId, { cascadeDebtPayments: true });
      await tx.delivery.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: `Reversed by Admin: ${reason}`, cancelledAt: new Date(), cancelledById: actorId } });
      await audit(tx, { actorId, action: 'DELIVERY_REVERSE', entityType: 'Delivery', entityId: id, previousValues: { status: 'DELIVERED' }, newValues: { status: 'CANCELLED', reason } });
      return getDeliveryTx(tx, id);
    },
    { timeout: 20000 },
  );
}

export type PayStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

/** Payment status is derived from the order's recorded payments (never stored separately, so it cannot drift). */
function derive(d: DeliveryRow, names: Map<string, string>) {
  const itemsTotal = sum(d.items.map((i) => i.lineTotal));
  const orderTotal = d.orderTotal.gt(0) ? d.orderTotal : itemsTotal.plus(d.deliveryFee);
  const live = d.sale && d.sale.status === 'COMPLETED' ? d.sale : null;
  const paid = live ? live.amountPaid : D(0);
  const total = live ? live.totalAmount : orderTotal;
  const due = d.status === 'CANCELLED' ? D(0) : total.minus(paid);
  const paymentStatus: PayStatus = paid.lte(0) ? 'UNPAID' : paid.gte(total) ? 'PAID' : 'PARTIAL';
  const methods = new Map<string, number>();
  let lastPaymentAt: Date | null = null;
  for (const a of live?.allocations ?? []) {
    methods.set(a.payment.paymentMethod, (methods.get(a.payment.paymentMethod) ?? 0) + num(a.allocatedAmount));
    if (!lastPaymentAt || a.payment.createdAt > lastPaymentAt) lastPaymentAt = a.payment.createdAt;
  }
  const references = (live?.allocations ?? []).map((a) => a.payment.reference).filter(Boolean) as string[];
  return {
    ...d,
    itemsTotal,
    orderTotal: total,
    amountPaid: paid,
    amountDue: due,
    amountToCollect: due,
    paymentStatus,
    paymentMethods: [...methods.entries()].map(([method, amount]) => ({ method, amount })),
    gcashAmount: methods.get('GCASH') ?? 0,
    cashAmount: methods.get('CASH') ?? 0,
    lastPaymentAt,
    references,
    deliveredByName: d.deliveredById ? names.get(d.deliveredById) ?? null : null,
    cancelledByName: d.cancelledById ? names.get(d.cancelledById) ?? null : null,
  };
}

export type DeliveryTab = 'all' | 'pending' | 'out' | 'delivered' | 'unpaid' | 'partial' | 'paid' | 'gcash' | 'cancelled';
type Derived = ReturnType<typeof derive>;

const TAB_TEST: Record<DeliveryTab, (d: Derived) => boolean> = {
  all: () => true,
  pending: (d) => d.status === 'PENDING' || d.status === 'ASSIGNED',
  out: (d) => d.status === 'OUT_FOR_DELIVERY',
  delivered: (d) => d.status === 'DELIVERED',
  unpaid: (d) => d.status !== 'CANCELLED' && d.paymentStatus === 'UNPAID',
  partial: (d) => d.status !== 'CANCELLED' && d.paymentStatus === 'PARTIAL',
  paid: (d) => d.status !== 'CANCELLED' && d.paymentStatus === 'PAID',
  gcash: (d) => d.status !== 'CANCELLED' && d.gcashAmount > 0,
  cancelled: (d) => d.status === 'CANCELLED',
};

export function deliveryTotals(rows: Derived[]) {
  const live = rows.filter((d) => d.status !== 'CANCELLED');
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    orders: rows.length,
    delivered: rows.filter((d) => d.status === 'DELIVERED').length,
    unpaidAmount: r2(live.filter((d) => d.paymentStatus === 'UNPAID').reduce((a, d) => a + num(d.amountDue), 0)),
    partialAmount: r2(live.filter((d) => d.paymentStatus === 'PARTIAL').reduce((a, d) => a + num(d.amountDue), 0)),
    paidAmount: r2(live.filter((d) => d.paymentStatus === 'PAID').reduce((a, d) => a + num(d.amountPaid), 0)),
    gcashAmount: r2(live.reduce((a, d) => a + d.gcashAmount, 0)),
  };
}

export async function listDeliveries(f: { all?: boolean; tab?: DeliveryTab; q?: string | null; date?: string | null; period?: 'today' | 'week' | 'month' | 'year' | 'custom'; from?: string | null; to?: string | null; customerId?: string | null }) {
  const range = f.date && parseYmd(f.date) ? resolveRange('custom', { from: f.date, to: f.date }) : f.period ? resolveRange(f.period, { from: f.from, to: f.to }) : null;
  const q = f.q?.trim();
  const where: Prisma.DeliveryWhereInput = {
    ...(range ? { scheduledAt: { gte: range.start, lt: range.end } } : f.all ? {} : { OR: [{ status: { in: OPEN } }, { scheduledAt: { gte: new Date(Date.now() - 14 * 86400000) } }] }),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { orderNumber: { contains: q, mode: 'insensitive' } },
                { addressSnapshot: { contains: q, mode: 'insensitive' } },
                { customer: { name: { contains: q, mode: 'insensitive' } } },
                { customer: { phone: { contains: q.replace(/[\s\-]/g, '') } } },
              ],
            },
          ],
        }
      : {}),
  };
  const [rows, users] = await Promise.all([
    prisma.delivery.findMany({ where, include: deliveryInclude, orderBy: [{ scheduledAt: 'asc' }], take: 500 }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const base = rows.map((d) => derive(d, names));
  // Open orders first (soonest first), then finished ones (newest first).
  base.sort((a, b) => {
    const ao = OPEN.includes(a.status) ? 0 : 1;
    const bo = OPEN.includes(b.status) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return ao === 0 ? a.scheduledAt.getTime() - b.scheduledAt.getTime() : b.scheduledAt.getTime() - a.scheduledAt.getTime();
  });
  const tab = f.tab ?? 'all';
  const filtered = base.filter(TAB_TEST[tab]);
  const counts = Object.fromEntries((Object.keys(TAB_TEST) as DeliveryTab[]).map((t) => [t, base.filter(TAB_TEST[t]).length]));
  return { rows: filtered, totals: deliveryTotals(filtered), counts, tab };
}

export { deliveryInclude as _include };
