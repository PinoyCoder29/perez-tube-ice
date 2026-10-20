import { route, parseJson } from '@/lib/api';
import { customerPriceUpdate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { updateCustomerPrice } from '@/services/pricing.service';

// Edit / activate / deactivate. There is deliberately no DELETE: rows referenced by history are never removed.
export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin();
  return updateCustomerPrice(params.id, await parseJson(req, customerPriceUpdate), admin.id);
});
