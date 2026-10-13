import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { productCreate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { D } from '@/lib/money';
import { audit } from '@/lib/audit';

export const GET = route(async (req) => {
  const all = req.nextUrl.searchParams.get('all') === '1';
  if (all) await requireAdmin();
  return prisma.product.findMany({
    where: all ? {} : { active: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { priceOptions: { where: all ? {} : { active: true }, orderBy: [{ sortOrder: 'asc' }, { sellingPrice: 'asc' }] } },
  });
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, productCreate);
  const p = await prisma.product.create({
    data: {
      name: b.name,
      description: b.description,
      active: b.active ?? true,
      sortOrder: b.sortOrder ?? 0,
      inventoryTrackingEnabled: b.inventoryTrackingEnabled ?? false,
      enforceStock: b.enforceStock ?? false,
      stockUnit: b.stockUnit ?? 'sack',
      lowStockThreshold: b.lowStockThreshold ? D(b.lowStockThreshold) : null,
    },
  });
  await audit(prisma, { actorId: admin.id, action: 'PRODUCT_CREATE', entityType: 'Product', entityId: p.id, newValues: p });
  return p;
});
