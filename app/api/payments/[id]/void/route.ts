import { route, parseJson } from '@/lib/api';
import { reasonBody } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { voidDebtPayment } from '@/services/payments.service';

export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const { reason } = await parseJson(req, reasonBody);
  return voidDebtPayment(params.id, reason, admin.id);
});
