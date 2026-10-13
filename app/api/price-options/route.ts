import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { priceOptionCreate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { D } from '@/lib/money';
import { audit } from '@/lib/audit';

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, priceOptionCreate);
  const product = await prisma.product.findUnique({ where: { id: b.productId } });
  if (!product) throw new HttpError(404, 'Product not found.');
  const po = await prisma.priceOption.create({
    data: {
      productId: b.productId,
      label: b.label,
      packageType: b.packageType,
      sellingPrice: D(b.sellingPrice),
      unitDescription: b.unitDescription,
      sacksPerUnit: b.sacksPerUnit ? D(b.sacksPerUnit) : null,
      inventoryQuantityPerUnit: b.inventoryQuantityPerUnit ? D(b.inventoryQuantityPerUnit) : null,
      active: b.active ?? true,
      sortOrder: b.sortOrder ?? 0,
      history: { create: { newPrice: D(b.sellingPrice), changedById: admin.id } },
    },
  });
  await audit(prisma, { actorId: admin.id, action: 'PRICE_CREATE', entityType: 'PriceOption', entityId: po.id, newValues: po });
  return po;
});
