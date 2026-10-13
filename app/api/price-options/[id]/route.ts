import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { priceOptionUpdate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { D } from '@/lib/money';
import { audit } from '@/lib/audit';

// Changing a price only affects FUTURE sales: sale items store their own price snapshot.
export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, priceOptionUpdate);
  const before = await prisma.priceOption.findUnique({ where: { id: params.id } });
  if (!before) throw new HttpError(404, 'Price option not found.');
  const { sellingPrice, sacksPerUnit, inventoryQuantityPerUnit, ...rest } = b;
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.priceOption.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(sellingPrice !== undefined ? { sellingPrice: D(sellingPrice) } : {}),
        ...(sacksPerUnit !== undefined ? { sacksPerUnit: sacksPerUnit ? D(sacksPerUnit) : null } : {}),
        ...(inventoryQuantityPerUnit !== undefined ? { inventoryQuantityPerUnit: inventoryQuantityPerUnit ? D(inventoryQuantityPerUnit) : null } : {}),
      },
    });
    if (sellingPrice !== undefined && !before.sellingPrice.eq(D(sellingPrice))) {
      await tx.priceHistory.create({ data: { priceOptionId: params.id, oldPrice: before.sellingPrice, newPrice: D(sellingPrice), changedById: admin.id } });
    }
    await audit(tx, { actorId: admin.id, action: 'PRICE_UPDATE', entityType: 'PriceOption', entityId: params.id, previousValues: before, newValues: updated });
    return updated;
  });
  return after;
});
