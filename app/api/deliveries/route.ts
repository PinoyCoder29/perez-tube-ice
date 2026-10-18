import { route, parseJson } from '@/lib/api';
import { deliveryCreate } from '@/lib/validation';
import { getFullAdmin, requireAdmin } from '@/lib/auth';
import { createDelivery, listDeliveries } from '@/services/deliveries.service';
import type { DeliveryTab } from '@/services/deliveries.service';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  const tab = (sp.get('tab') || 'all') as DeliveryTab;
  const date = sp.get('date');
  // Staff see the delivery queue (and can pick a date); Admin may also use period filters and a customer filter.
  return listDeliveries({
    tab,
    q: sp.get('q'),
    date,
    ...(admin ? { period: (sp.get('period') as never) || undefined, from: sp.get('from'), to: sp.get('to'), customerId: sp.get('customerId') } : {}),
  });
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, deliveryCreate);
  return createDelivery({ ...b, scheduledTime: b.scheduledTime || null }, admin.id);
});
