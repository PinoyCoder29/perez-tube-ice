import { route } from '@/lib/api';
import { paymentOverview } from '@/services/overview.service';
import { getFullAdmin } from '@/lib/auth';
import { STAFF_HISTORY_DAYS } from '@/lib/constants';
import { HttpError } from '@/lib/errors';
import type { Period } from '@/lib/date';

// Admin and Staff may both view it (Staff need it for collections). Staff are limited to recent history.
export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  let period = (['today', 'week', 'month', 'year', 'custom', 'all'].includes(sp.get('period') ?? '') ? sp.get('period') : 'month') as Period | 'all';
  if (!admin && (period === 'year' || period === 'all')) period = 'month';
  const from = sp.get('from');
  const to = sp.get('to');
  if (!admin && period === 'custom' && from) {
    const d = new Date(from).getTime();
    if (Date.now() - d > STAFF_HISTORY_DAYS * 86400000) throw new HttpError(403, `Staff can look back up to ${STAFF_HISTORY_DAYS} days.`);
  }
  const status = ['UNPAID', 'PARTIAL', 'PAID'].includes(sp.get('status') ?? '') ? (sp.get('status') as 'UNPAID' | 'PARTIAL' | 'PAID') : null;
  return paymentOverview({ period, from, to, status, method: sp.get('method') || null, q: sp.get('q') });
});
