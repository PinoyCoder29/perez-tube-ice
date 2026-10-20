import { route, parseJson } from '@/lib/api';
import { deliveryCreate } from '@/lib/validation';
import { getActor, getFullAdmin } from '@/lib/auth';
import { getSettings } from '@/services/settings.service';
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

// Staff (no password) and Admin can both create delivery orders directly: no assignment step.
export const POST = route(async (req) => {
  const actor = await getActor();
  const b = await parseJson(req, deliveryCreate);
  const allowCustom = actor.role === 'ADMIN' || (await getSettings()).allowStaffCustomPrice;
  return createDelivery({ ...b, scheduledTime: b.scheduledTime || null, payment: b.payment ?? null }, actor, { allowCustom });
});
