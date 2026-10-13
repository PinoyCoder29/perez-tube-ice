import { route, parseJson } from '@/lib/api';
import { expenseUpdate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { updateExpense } from '@/services/expenses.service';

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin();
  return updateExpense(params.id, await parseJson(req, expenseUpdate), admin.id);
});
