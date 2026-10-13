import { Prisma, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D, ZERO, sum, type Dec } from '@/lib/money';
import { audit } from '@/lib/audit';
import { fmtYmd, localYmd, resolveRange, type Period } from '@/lib/date';
import { isUniqueViolation } from '@/lib/api';

export interface SaleItemInput {
  priceOptionId: string;
  quantity: number;
  /** Internal only (delivery quotes): honour the price agreed at scheduling time. */
  unitPriceOverride?: Dec;
}
export interface CreateSaleInput {
  idempotencyKey?: string | null;
  customerId?: string | null;
  items: SaleItemInput[];
  payments: { method: PaymentMethod; amount: string }[];
  deliveryFee?: string | null;
  notes?: string | null;
}

export const saleInclude = {
  items: true,
  payments: true,
  customer: true,
  staff: { select: { id: true, name: true } },
} satisfies Prisma.SaleInclude;

export async function nextSequence(tx: Tx, key: string): Promise<number> {
  const r = await tx.sequence.upsert({ where: { key }, update: { value: { increment: 1 } }, create: { key, value: 1 } });
  return r.value;
}

export async function nextReference(tx: Tx, prefix: string): Promise<string> {
  const day = fmtYmd(localYmd(new Date())).replace(/-/g, '');
  const n = await nextSequence(tx, `${prefix}-${day}`);
  return `${prefix}-${day}-${String(n).padStart(4, '0')}`;
}

export function paymentStatusFor(total: Dec, paid: Dec): PaymentStatus {
  if (paid.lte(0)) return 'UNPAID';
  return paid.gte(total) ? 'PAID' : 'PARTIAL';
}

/**
 * Creates a sale, its payments, any credit charge and stock movements.
 * MUST run inside a transaction. Prices and totals are always recomputed here.
 */
export async function createSaleTx(tx: Tx, input: CreateSaleInput, actorId: string, opts: { allowInactive?: boolean } = {}) {
  const qtyById = new Map<string, { qty: number; override?: Dec }>();
  for (const it of input.items) {
    const cur = qtyById.get(it.priceOptionId);
    qtyById.set(it.priceOptionId, { qty: (cur?.qty ?? 0) + it.quantity, override: it.unitPriceOverride ?? cur?.override });
  }
  const options = await tx.priceOption.findMany({ where: { id: { in: [...qtyById.keys()] } }, include: { product: true } });
  if (options.length !== qtyById.size) throw new HttpError(400, 'One or more items no longer exist. Refresh the page and try again.');
  if (!opts.allowInactive) {
    for (const o of options) {
      if (!o.active || !o.product.active) throw new HttpError(400, `"${o.product.name} ${o.label}" is no longer available. Refresh the POS.`);
    }
  }

  const lines = options.map((o) => {
    const { qty, override } = qtyById.get(o.id)!;
    const unit = override ?? o.sellingPrice;
    return {
      o,
      qty,
      unit,
      lineTotal: unit.mul(qty),
      sacks: (o.sacksPerUnit ?? ZERO).mul(qty),
      invQty: o.product.inventoryTrackingEnabled && o.inventoryQuantityPerUnit ? o.inventoryQuantityPerUnit.mul(qty) : ZERO,
    };
  });

  const subtotal = sum(lines.map((l) => l.lineTotal));
  const deliveryFee = D(input.deliveryFee ?? 0);
  const total = subtotal.plus(deliveryFee);
  const paid = sum(input.payments.map((p) => p.amount));
  if (paid.gt(total)) throw new HttpError(400, 'Payments are more than the sale total.');
  const balance = total.minus(paid);

  const customerId = input.customerId ?? null;
  if (customerId) {
    const c = await tx.customer.findUnique({ where: { id: customerId } });
    if (!c || !c.active) throw new HttpError(400, 'Customer not found or inactive.');
  }
  if (balance.gt(0) && !customerId) throw new HttpError(400, 'Credit (utang) needs a registered customer. Select or add one.');

  const transactionNumber = await nextReference(tx, 'PI');
  const sale = await tx.sale.create({
    data: {
      transactionNumber,
      idempotencyKey: input.idempotencyKey ?? null,
      customerId,
      staffId: actorId,
      subtotal,
      discountAmount: ZERO,
      deliveryFee,
      totalAmount: total,
      amountPaid: paid,
      paymentStatus: paymentStatusFor(total, paid),
      notes: input.notes ?? null,
      items: {
        create: lines.map((l) => ({
          productId: l.o.productId,
          priceOptionId: l.o.id,
          productNameSnapshot: l.o.product.name,
          packageTypeSnapshot: l.o.packageType,
          labelSnapshot: l.o.label,
          unitPrice: l.unit,
          quantity: l.qty,
          lineTotal: l.lineTotal,
          sacks: l.sacks,
          inventoryQty: l.invQty,
        })),
      },
    },
  });

  for (const p of input.payments) {
    await tx.payment.create({
      data: {
        paymentReference: await nextReference(tx, 'PAY'),
        saleId: sale.id,
        customerId,
        amount: D(p.amount),
        paymentMethod: p.method,
        paymentType: 'SALE_PAYMENT',
        receivedById: actorId,
        allocations: { create: { saleId: sale.id, allocatedAmount: D(p.amount) } },
      },
    });
  }

  if (balance.gt(0)) {
    await tx.ledgerEntry.create({
      data: { customerId: customerId!, type: 'CHARGE', amount: balance, saleId: sale.id, note: `Credit sale ${transactionNumber}`, recordedById: actorId },
    });
  }

  // Stock: only products with tracking on AND a configured per-unit conversion are touched.
  const byProduct = new Map<string, { name: string; enforce: boolean; qty: Dec }>();
  for (const l of lines) {
    if (l.invQty.gt(0)) {
      const cur = byProduct.get(l.o.productId);
      byProduct.set(l.o.productId, { name: l.o.product.name, enforce: l.o.product.enforceStock, qty: (cur?.qty ?? ZERO).plus(l.invQty) });
    }
  }
  for (const [productId, v] of byProduct) {
    if (v.enforce) {
      const r = await tx.product.updateMany({ where: { id: productId, currentStock: { gte: v.qty } }, data: { currentStock: { decrement: v.qty } } });
      if (r.count === 0) throw new HttpError(409, `Not enough ${v.name} in stock for this sale.`);
    } else {
      await tx.product.update({ where: { id: productId }, data: { currentStock: { decrement: v.qty } } });
    }
    await tx.inventoryMovement.create({
      data: { productId, movementType: 'SALE', quantity: v.qty.neg(), reason: `Sale ${transactionNumber}`, referenceType: 'Sale', referenceId: sale.id, recordedById: actorId },
    });
  }

  await audit(tx, { actorId, action: 'SALE_CREATE', entityType: 'Sale', entityId: sale.id, newValues: { transactionNumber, total, paid, balance, customerId } });
  return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
}

export async function createSale(input: CreateSaleInput, actorId: string) {
  const key = input.idempotencyKey ?? null;
  try {
    return await prisma.$transaction(
      async (tx) => {
        if (key) {
          const ex = await tx.sale.findUnique({ where: { idempotencyKey: key }, include: saleInclude });
          if (ex) return { sale: ex, duplicate: true };
        }
        return { sale: await createSaleTx(tx, input, actorId), duplicate: false };
      },
      { timeout: 20000 },
    );
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const ex = await prisma.sale.findUnique({ where: { idempotencyKey: key }, include: saleInclude });
      if (ex) return { sale: ex, duplicate: true };
    }
    throw e;
  }
}

export async function getSale(id: string) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { ...saleInclude, payments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!sale) throw new HttpError(404, 'Sale not found.');
  return sale;
}

export interface SaleFilters {
  period?: Period;
  from?: string | null;
  to?: string | null;
  productId?: string | null;
  staffId?: string | null;
  customerId?: string | null;
  method?: PaymentMethod | null;
  paymentStatus?: PaymentStatus | null;
  status?: 'COMPLETED' | 'VOIDED' | null;
  q?: string | null;
  page: number;
  pageSize: number;
}

export async function listSales(f: SaleFilters) {
  const range = f.period ? resolveRange(f.period, { from: f.from, to: f.to }) : null;
  const where: Prisma.SaleWhereInput = {
    ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
    ...(f.productId ? { items: { some: { productId: f.productId } } } : {}),
    ...(f.staffId ? { staffId: f.staffId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.method ? { payments: { some: { paymentMethod: f.method, status: 'ACTIVE' } } } : {}),
    ...(f.paymentStatus ? { paymentStatus: f.paymentStatus } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { OR: [{ transactionNumber: { contains: f.q, mode: 'insensitive' } }, { customer: { name: { contains: f.q, mode: 'insensitive' } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      include: { items: true, payments: true, customer: { select: { id: true, name: true } }, staff: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);
  return { total, page: f.page, pageSize: f.pageSize, rows };
}

/** Controlled reversal: nothing is deleted; payments, charges and stock are reversed with audit entries. */
export async function voidSale(id: string, reason: string, actorId: string) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${id} FOR UPDATE`;
      const sale = await tx.sale.findUnique({ where: { id } });
      if (!sale) throw new HttpError(404, 'Sale not found.');
      if (sale.status === 'VOIDED') throw new HttpError(409, 'This sale is already voided.');

      const debtPaid = await tx.paymentAllocation.count({
        where: { saleId: id, payment: { paymentType: 'DEBT_PAYMENT', status: 'ACTIVE' } },
      });
      if (debtPaid > 0) throw new HttpError(409, 'Later debt payments were applied to this sale. Void those payments first.');

      const now = new Date();
      await tx.payment.updateMany({
        where: { saleId: id, paymentType: 'SALE_PAYMENT', status: 'ACTIVE' },
        data: { status: 'VOIDED', voidReason: reason, voidedAt: now },
      });

      const charges = await tx.ledgerEntry.findMany({ where: { saleId: id, type: 'CHARGE' } });
      for (const c of charges) {
        await tx.ledgerEntry.create({
          data: { customerId: c.customerId, type: 'REVERSAL', amount: c.amount.neg(), saleId: id, note: `Void ${sale.transactionNumber}: ${reason}`, recordedById: actorId },
        });
      }

      const moves = await tx.inventoryMovement.findMany({ where: { referenceType: 'Sale', referenceId: id, movementType: 'SALE' } });
      for (const m of moves) {
        const back = m.quantity.neg();
        await tx.product.update({ where: { id: m.productId }, data: { currentStock: { increment: back } } });
        await tx.inventoryMovement.create({
          data: { productId: m.productId, movementType: 'SALE_REVERSAL', quantity: back, reason: `Void ${sale.transactionNumber}`, referenceType: 'Sale', referenceId: id, recordedById: actorId },
        });
      }

      const updated = await tx.sale.update({ where: { id }, data: { status: 'VOIDED', voidReason: reason, voidedAt: now, voidedById: actorId } });
      await audit(tx, { actorId, action: 'SALE_VOID', entityType: 'Sale', entityId: id, previousValues: { status: sale.status }, newValues: { status: 'VOIDED', reason } });
      return updated;
    },
    { timeout: 20000 },
  );
}
