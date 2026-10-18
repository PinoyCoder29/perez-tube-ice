import { route, parseJson } from '@/lib/api';
import { reasonBody } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { reverseDelivery } from '@/services/deliveries.service';

// Admin-only correction of an order that was already delivered.
export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const { reason } = await parseJson(req, reasonBody);
  return reverseDelivery(params.id, reason, admin.id);
});
