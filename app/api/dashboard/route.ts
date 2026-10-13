import { route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { getDashboard } from '@/services/dashboard.service';
import type { Period } from '@/lib/date';

export const GET = route(async (req) => {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const period = (['today', 'week', 'month', 'year', 'custom'].includes(sp.get('period') ?? '') ? sp.get('period') : 'today') as Period;
  return getDashboard(period, sp.get('from'), sp.get('to'));
});
