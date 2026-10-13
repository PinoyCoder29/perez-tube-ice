import { route, parseJson } from '@/lib/api';
import { deliveryCreate } from '@/lib/validation';
import { getFullAdmin, requireAdmin } from '@/lib/auth';
import { createDelivery, listDeliveries } from '@/services/deliveries.service';
import type { DeliveryStatus } from '@prisma/client';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  if (!admin) return listDeliveries({ staffQueue: true });
  const statuses = (sp.get('status') ?? '').split(',').filter(Boolean) as DeliveryStatus[];
  return listDeliveries({
    statuses,
    customerId: sp.get('customerId'),
    period: (sp.get('period') as never) || undefined,
    from: sp.get('from'),
    to: sp.get('to'),
  });
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, deliveryCreate);
  return createDelivery({ ...b, scheduledTime: b.scheduledTime || null }, admin.id);
});
