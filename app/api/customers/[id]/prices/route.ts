import { route, parseJson } from '@/lib/api';
import { customerPriceCreate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { createCustomerPrice, listCustomerPrices } from '@/services/pricing.service';
import { prisma } from '@/lib/db/prisma';

// Customer-specific price configuration: Admin only.
export const GET = route(async (_req, { params }) => {
  await requireAdmin();
  const [prices, options] = await Promise.all([
    listCustomerPrices(params.id),
    prisma.priceOption.findMany({ include: { product: { select: { name: true, active: true } } }, orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }] }),
  ]);
  return { prices, options };
});

export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin();
  return createCustomerPrice(params.id, await parseJson(req, customerPriceCreate), admin.id);
});
