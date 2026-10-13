import { route, parseJson, intParam } from '@/lib/api';
import { expenseCreate } from '@/lib/validation';
import { getActor, getFullAdmin } from '@/lib/auth';
import { createExpense, listExpenses } from '@/services/expenses.service';
import type { Period } from '@/lib/date';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  const page = intParam(sp.get('page'), 1, 1, 100000);
  const pageSize = intParam(sp.get('pageSize'), 25, 1, 100);
  if (!admin) return listExpenses({ period: 'today', page, pageSize });
  const g = (k: string) => sp.get(k) || null;
  return listExpenses({
    period: (g('period') as Period) || undefined,
    from: g('from'),
    to: g('to'),
    category: g('category'),
    staffId: g('staffId'),
    includeVoided: sp.get('voided') === '1',
    page,
    pageSize,
  });
});

export const POST = route(async (req) => {
  const actor = await getActor();
  return createExpense(await parseJson(req, expenseCreate), actor.id);
});
