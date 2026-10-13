import { MovementType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D } from '@/lib/money';
import { audit } from '@/lib/audit';

export async function listInventory() {
  const products = await prisma.product.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
    configured: p.inventoryTrackingEnabled,
    enforceStock: p.enforceStock,
    stockUnit: p.stockUnit,
    currentStock: p.inventoryTrackingEnabled ? p.currentStock : null,
    lowStockThreshold: p.lowStockThreshold,
    low: p.inventoryTrackingEnabled && p.lowStockThreshold !== null && p.currentStock.lte(p.lowStockThreshold),
  }));
}

export async function recordMovement(input: { productId: string; movementType: 'OPENING' | 'RECEIVED' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'; quantity: string; reason?: string | null }, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.product.findUnique({ where: { id: input.productId } });
    if (!p) throw new HttpError(404, 'Product not found.');
    if (!p.inventoryTrackingEnabled) throw new HttpError(400, 'Turn on stock tracking for this product first.');
    const qty = D(input.quantity);
    const out = input.movementType === 'ADJUSTMENT_OUT';
    if (out) {
      const r = await tx.product.updateMany({ where: { id: p.id, currentStock: { gte: qty } }, data: { currentStock: { decrement: qty } } });
      if (r.count === 0) throw new HttpError(400, 'That would make stock negative.');
    } else {
      await tx.product.update({ where: { id: p.id }, data: { currentStock: { increment: qty } } });
    }
    const m = await tx.inventoryMovement.create({
      data: { productId: p.id, movementType: input.movementType as MovementType, quantity: out ? qty.neg() : qty, reason: input.reason ?? null, referenceType: 'Manual', recordedById: actorId },
    });
    await audit(tx, { actorId, action: 'INVENTORY_MOVEMENT', entityType: 'Product', entityId: p.id, newValues: { type: input.movementType, quantity: qty, reason: input.reason } });
    return m;
  });
}

export async function listMovements(productId: string | null, take = 100) {
  return prisma.inventoryMovement.findMany({
    where: productId ? { productId } : {},
    include: { product: { select: { name: true, stockUnit: true } }, recordedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
