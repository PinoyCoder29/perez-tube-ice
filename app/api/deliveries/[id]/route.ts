import { route, parseJson } from '@/lib/api';
import { deliveryUpdate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { updateDelivery } from '@/services/deliveries.service';

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, deliveryUpdate);
  return updateDelivery(params.id, { ...b, scheduledTime: b.scheduledTime || null }, { id: admin.id, name: admin.name, role: 'ADMIN' }, { allowCustom: true });
});
