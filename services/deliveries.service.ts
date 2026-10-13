import { DeliveryStatus, DeliveryPaymentType, PaymentMethod, Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D, ZERO, sum } from '@/lib/money';
import { audit } from '@/lib/audit';
import { zonedTimeToUtc, getTimezone, resolveRange } from '@/lib/date';
import { STAFF_USERNAME, type Actor } from '@/lib/auth';
import { createSaleTx } from './sales.service';

export interface DeliveryInput {
  customerId: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  items: { priceOptionId: string; quantity: number }[];
  deliveryFee?: string;
  paymentType: DeliveryPaymentType;
  instructions?: string | null;
  assign?: boolean;
}

function schedule(date: string, time?: string | null) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time ? time.split(':').map(Number) : [0, 0];
  return { scheduledAt: zonedTimeToUtc(y, m, d, h, mi, getTimezone()), hasTime: !!time };
}

async function buildItems(tx: Tx, items: { priceOptionId: string; quantity: number }[]) {
  const ids = [...new Set(items.map((i) => i.priceOptionId))];
  const opts = await tx.priceOption.findMany({ where: { id: { in: ids } }, include: { product: true } });
  if (opts.length !== ids.length) throw new HttpError(400, 'One or more items no longer exist.');
  const qty = new Map<string, number>();
  for (const i of items) qty.set(i.priceOptionId, (qty.get(i.priceOptionId) ?? 0) + i.quantity);
  return opts.map((o) => {
    if (!o.active || !o.product.active) throw new HttpError(400, `"${o.product.name} ${o.label}" is not available.`);
    const q = qty.get(o.id)!;
    return {
      productId: o.productId,
      priceOptionId: o.id,
      productNameSnapshot: o.product.name,
      packageTypeSnapshot: o.packageType,
      labelSnapshot: o.label,
      unitPrice: o.sellingPrice,
      quantity: q,
      lineTotal: o.sellingPrice.mul(q),
    };
  });
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
  sale: { select: { id: true, transactionNumber: true, totalAmount: true, amountPaid: true, paymentStatus: true } },
} satisfies Prisma.DeliveryInclude;

export async function createDelivery(input: DeliveryInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!c || !c.active) throw new HttpError(400, 'Customer not found or inactive.');
    const items = await buildItems(tx, input.items);
    const { scheduledAt, hasTime } = schedule(input.scheduledDate, input.scheduledTime);
    const d = await tx.delivery.create({
      data: {
        customerId: c.id,
        addressSnapshot: c.landmark ? `${c.address} (${c.landmark})` : c.address,
        phoneSnapshot: c.phone,
        scheduledAt,
        hasTime,
        deliveryFee: D(input.deliveryFee ?? 0),
        paymentType: input.paymentType,
        instructions: input.instructions ?? null,
        status: input.assign ? 'ASSIGNED' : 'PENDING',
        assignedStaffId: input.assign ? await staffUserId(tx) : null,
        createdById: actorId,
        items: { create: items },
      },
      include: deliveryInclude,
    });
    await audit(tx, { actorId, action: 'DELIVERY_CREATE', entityType: 'Delivery', entityId: d.id, newValues: { customerId: c.id, status: d.status } });
    return d;
  });
}

export async function updateDelivery(id: string, patch: Partial<DeliveryInput>, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const d = await tx.delivery.findUnique({ where: { id }, include: { items: true } });
    if (!d) throw new HttpError(404, 'Delivery not found.');
    if (['DELIVERED', 'CANCELLED'].includes(d.status) || d.saleId) throw new HttpError(409, 'Completed or cancelled deliveries cannot be edited.');
    const data: Prisma.DeliveryUpdateInput = {};
    if (patch.scheduledDate) Object.assign(data, schedule(patch.scheduledDate, patch.scheduledTime));
    if (patch.deliveryFee !== undefined) data.deliveryFee = D(patch.deliveryFee);
    if (patch.paymentType) data.paymentType = patch.paymentType;
    if (patch.instructions !== undefined) data.instructions = patch.instructions;
    if (patch.items) {
      const items = await buildItems(tx, patch.items);
      await tx.deliveryItem.deleteMany({ where: { deliveryId: id } });
      data.items = { create: items };
    }
    const after = await tx.delivery.update({ where: { id }, data, include: deliveryInclude });
    await audit(tx, { actorId, action: 'DELIVERY_UPDATE', entityType: 'Delivery', entityId: id, previousValues: d, newValues: after });
    return after;
  });
}

const FROM: Record<string, DeliveryStatus[]> = {
  ASSIGNED: ['PENDING', 'FAILED'],
  OUT_FOR_DELIVERY: ['ASSIGNED'],
  FAILED: ['ASSIGNED', 'OUT_FOR_DELIVERY'],
  CANCELLED: ['PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'FAILED'],
  PENDING: ['ASSIGNED', 'FAILED'],
};

export async function changeDeliveryStatus(
  id: string,
  body: { status: DeliveryStatus; reason?: string | null; payments?: { method: PaymentMethod; amount: string }[] },
  actor: Actor,
) {
  const { status } = body;
  const adminOnly: DeliveryStatus[] = ['PENDING', 'ASSIGNED', 'CANCELLED'];
  if (adminOnly.includes(status) && actor.role !== 'ADMIN') throw new HttpError(403, 'Only Admin can do that.');
  if ((status === 'FAILED' || status === 'CANCELLED') && !body.reason) throw new HttpError(400, 'Please give a reason.');

  return prisma.$transaction(
    async (tx) => {
      if (status === 'DELIVERED') {
        // Atomic claim: only one request can flip a delivery without a sale into DELIVERED.
        const claimed = await tx.delivery.updateMany({
          where: { id, saleId: null, status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] } },
          data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredById: actor.id },
        });
        if (claimed.count === 0) throw new HttpError(409, 'This delivery cannot be completed (already delivered, cancelled, or not assigned).');
        const d = await tx.delivery.findUniqueOrThrow({ where: { id }, include: { items: true } });
        const sale = await createSaleTx(
          tx,
          {
            customerId: d.customerId,
            items: d.items.map((i) => ({ priceOptionId: i.priceOptionId, quantity: i.quantity, unitPriceOverride: i.unitPrice })),
            payments: body.payments ?? [],
            deliveryFee: d.deliveryFee.toString(),
            notes: `Delivery to ${d.addressSnapshot}`,
          },
          actor.id,
          { allowInactive: true },
        );
        await tx.delivery.update({ where: { id }, data: { saleId: sale.id } });
        await audit(tx, { actorId: actor.id, action: 'DELIVERY_COMPLETE', entityType: 'Delivery', entityId: id, newValues: { saleId: sale.id, total: sale.totalAmount, paid: sale.amountPaid } });
        return tx.delivery.findUniqueOrThrow({ where: { id }, include: deliveryInclude });
      }

      const d = await tx.delivery.findUnique({ where: { id } });
      if (!d) throw new HttpError(404, 'Delivery not found.');
      if (!FROM[status]?.includes(d.status)) throw new HttpError(409, `Cannot move a ${d.status.toLowerCase().replace(/_/g, ' ')} delivery to ${status.toLowerCase().replace(/_/g, ' ')}.`);
      const data: Prisma.DeliveryUpdateInput = { status, statusReason: body.reason ?? null };
      if (status === 'ASSIGNED') data.assignedStaff = { connect: { id: await staffUserId(tx) } };
      if (status === 'PENDING') data.assignedStaff = { disconnect: true };
      const after = await tx.delivery.update({ where: { id }, data, include: deliveryInclude });
      await audit(tx, { actorId: actor.id, action: 'DELIVERY_STATUS', entityType: 'Delivery', entityId: id, previousValues: { status: d.status }, newValues: { status, reason: body.reason } });
      return after;
    },
    { timeout: 20000 },
  );
}

export async function listDeliveries(f: { statuses?: DeliveryStatus[]; staffQueue?: boolean; customerId?: string | null; period?: 'today' | 'week' | 'month' | 'year' | 'custom'; from?: string | null; to?: string | null }) {
  const range = f.period ? resolveRange(f.period, { from: f.from, to: f.to }) : null;
  const today = resolveRange('today');
  const where: Prisma.DeliveryWhereInput = f.staffQueue
    ? {
        OR: [
          { status: { in: ['ASSIGNED', 'OUT_FOR_DELIVERY'] } },
          { status: { in: ['DELIVERED', 'FAILED'] }, updatedAt: { gte: today.start, lt: today.end } },
        ],
      }
    : {
        ...(f.statuses?.length ? { status: { in: f.statuses } } : {}),
        ...(f.customerId ? { customerId: f.customerId } : {}),
        ...(range ? { scheduledAt: { gte: range.start, lt: range.end } } : {}),
      };
  const rows = await prisma.delivery.findMany({ where, include: deliveryInclude, orderBy: [{ scheduledAt: 'asc' }], take: 300 });
  return rows.map((d) => {
    const itemsTotal = sum(d.items.map((i) => i.lineTotal));
    const amountToCollect = d.sale ? d.sale.totalAmount.minus(d.sale.amountPaid) : itemsTotal.plus(d.deliveryFee);
    return { ...d, itemsTotal, amountToCollect: d.status === 'CANCELLED' ? ZERO : amountToCollect };
  });
}
