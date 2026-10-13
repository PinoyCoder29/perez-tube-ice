import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { productUpdate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { D } from '@/lib/money';
import { audit } from '@/lib/audit';

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, productUpdate);
  const before = await prisma.product.findUnique({ where: { id: params.id } });
  if (!before) throw new HttpError(404, 'Product not found.');
  const { lowStockThreshold, ...rest } = b;
  const after = await prisma.product.update({
    where: { id: params.id },
    data: { ...rest, ...(lowStockThreshold !== undefined ? { lowStockThreshold: lowStockThreshold ? D(lowStockThreshold) : null } : {}) },
  });
  await audit(prisma, { actorId: admin.id, action: 'PRODUCT_UPDATE', entityType: 'Product', entityId: params.id, previousValues: before, newValues: after });
  return after;
});
