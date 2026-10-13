import { route, parseJson } from '@/lib/api';
import { adjustmentBody } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { adjustDebt } from '@/services/debts.service';

export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, adjustmentBody);
  return adjustDebt(params.customerId, b.amount, b.note, admin.id);
});
