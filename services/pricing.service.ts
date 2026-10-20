import { Prisma } from '@prisma/client';
import { prisma, type DB } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D } from '@/lib/money';
import { audit } from '@/lib/audit';
import { resolveUnitPrice, type Tier } from '@/lib/pricing';

const toTier = (c: { id: string; minQuantity: number; sellingPrice: Prisma.Decimal; effectiveFrom: Date; active: boolean; updatedAt: Date }): Tier => ({
  id: c.id, minQuantity: c.minQuantity, price: c.sellingPrice.toFixed(2), effectiveFrom: c.effectiveFrom, active: c.active, updatedAt: c.updatedAt,
});

/** Server-side price for one package line. Throws if no valid price exists (never substitutes another package's price). */
export async function resolveLinePrice(db: DB, args: { customerId: string | null; priceOptionId: string; quantity: number; now?: Date }) {
  const o = await db.priceOption.findUnique({ where: { id: args.priceOptionId }, include: { product: true } });
  if (!o || !o.product.active) throw new HttpError(400, 'That product or package is not available.');
  const tiers = args.customerId ? (await db.customerPrice.findMany({ where: { customerId: args.customerId, priceOptionId: o.id } })).map(toTier) : [];
  const standard = o.active ? o.sellingPrice.toFixed(2) : null;
  const r = resolveUnitPrice({ standard, tiers, qty: args.quantity, now: args.now });
  if (!r) {
    throw new HttpError(400, `No valid price for ${o.product.name} — ${o.label} (quantity ${args.quantity}). Ask the Admin to set a price, or use a custom price.`);
  }
  return { option: o, unitPrice: D(r.price), source: r.source, customerPriceId: r.tierId ?? null };
}

/** What a customer may order and at what price: for the delivery form (display only; the server revalidates on confirm). */
export async function applicablePricing(customerId: string) {
  const [products, prices] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { priceOptions: { orderBy: [{ sortOrder: 'asc' }, { sellingPrice: 'asc' }] } },
    }),
    prisma.customerPrice.findMany({ where: { customerId, active: true } }),
  ]);
  const now = new Date();
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    options: p.priceOptions
      .map((o) => {
        const tiers = prices.filter((x) => x.priceOptionId === o.id && x.effectiveFrom <= now).sort((a, b) => a.minQuantity - b.minQuantity);
        return {
          id: o.id,
          label: o.label,
          packageType: o.packageType,
          unitDescription: o.unitDescription,
          sacksPerUnit: o.sacksPerUnit,
          standardPrice: o.active ? o.sellingPrice.toFixed(2) : null,
          tiers: tiers.map((t) => ({ id: t.id, minQuantity: t.minQuantity, price: t.sellingPrice.toFixed(2) })),
        };
      })
      .filter((o) => o.standardPrice !== null || o.tiers.length > 0),
  }));
}

export async function listCustomerPrices(customerId: string) {
  return prisma.customerPrice.findMany({
    where: { customerId },
    include: { priceOption: { include: { product: { select: { name: true } } } }, updatedBy: { select: { name: true } } },
    orderBy: [{ active: 'desc' }, { priceOption: { productId: 'asc' } }, { minQuantity: 'asc' }],
  });
}

interface PriceInput { priceOptionId: string; sellingPrice: string; minQuantity: number; effectiveFrom?: string | null; active?: boolean }

export async function createCustomerPrice(customerId: string, input: PriceInput, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const [c, o] = await Promise.all([tx.customer.findUnique({ where: { id: customerId } }), tx.priceOption.findUnique({ where: { id: input.priceOptionId } })]);
    if (!c) throw new HttpError(404, 'Customer not found.');
    if (!o) throw new HttpError(400, 'Package not found.');
    const dup = await tx.customerPrice.findFirst({ where: { customerId, priceOptionId: o.id, minQuantity: input.minQuantity, active: true } });
    if (dup) throw new HttpError(409, 'This customer already has an active price for that package and quantity rule. Edit it instead.');
    const price = D(input.sellingPrice);
    const row = await tx.customerPrice.create({
      data: {
        customerId, priceOptionId: o.id, sellingPrice: price, minQuantity: input.minQuantity,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(), active: input.active ?? true, createdById: adminId, updatedById: adminId,
        history: { create: { newPrice: price, newActive: input.active ?? true, newMinQuantity: input.minQuantity, changedById: adminId } },
      },
    });
    await audit(tx, { actorId: adminId, action: 'CUSTOMER_PRICE_CREATE', entityType: 'CustomerPrice', entityId: row.id, newValues: row });
    return row;
  });
}

export async function updateCustomerPrice(id: string, patch: Partial<PriceInput>, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.customerPrice.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, 'Customer price not found.');
    const minQuantity = patch.minQuantity ?? before.minQuantity;
    const active = patch.active ?? before.active;
    if (active) {
      const dup = await tx.customerPrice.findFirst({ where: { customerId: before.customerId, priceOptionId: before.priceOptionId, minQuantity, active: true, NOT: { id } } });
      if (dup) throw new HttpError(409, 'Another active price already uses that quantity rule.');
    }
    const price = patch.sellingPrice !== undefined ? D(patch.sellingPrice) : before.sellingPrice;
    const after = await tx.customerPrice.update({
      where: { id },
      data: { sellingPrice: price, minQuantity, active, ...(patch.effectiveFrom ? { effectiveFrom: new Date(patch.effectiveFrom) } : {}), updatedById: adminId },
    });
    await tx.customerPriceHistory.create({
      data: { customerPriceId: id, oldPrice: before.sellingPrice, newPrice: price, oldActive: before.active, newActive: active, oldMinQuantity: before.minQuantity, newMinQuantity: minQuantity, changedById: adminId },
    });
    await audit(tx, { actorId: adminId, action: 'CUSTOMER_PRICE_UPDATE', entityType: 'CustomerPrice', entityId: id, previousValues: before, newValues: after });
    return after;
  });
}
