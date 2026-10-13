import { route, parseJson } from '@/lib/api';
import { reasonBody } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { voidExpense } from '@/services/expenses.service';

export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin();
  const { reason } = await parseJson(req, reasonBody);
  return voidExpense(params.id, reason, admin.id);
});
