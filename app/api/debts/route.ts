import { route } from '@/lib/api';
import { getFullAdmin } from '@/lib/auth';
import { debtCards, debtorTable } from '@/services/debts.service';
import type { Period } from '@/lib/date';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  const period = (sp.get('period') as Period) || null;
  const rows = await debtorTable({
    q: sp.get('q'),
    period,
    from: sp.get('from'),
    to: sp.get('to'),
    outstandingOnly: admin ? sp.get('outstanding') === '1' : true,
  });
  return admin && sp.get('cards') === '1' ? { cards: await debtCards(), rows } : { rows };
});
