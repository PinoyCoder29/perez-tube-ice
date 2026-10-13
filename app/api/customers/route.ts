import { route, parseJson, intParam } from '@/lib/api';
import { customerCreate } from '@/lib/validation';
import { getActor, getFullAdmin } from '@/lib/auth';
import { createCustomer, listCustomers } from '@/services/customers.service';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  const res = await listCustomers({
    q: sp.get('q'),
    includeInactive: !!admin && sp.get('inactive') === '1',
    take: intParam(sp.get('take'), 30, 1, 100),
    skip: intParam(sp.get('skip'), 0, 0, 100000),
  });
  // Staff lookup is limited: no internal notes.
  return admin ? res : { ...res, rows: res.rows.map((r) => ({ ...r, notes: null })) };
});

export const POST = route(async (req) => {
  const actor = await getActor();
  return createCustomer(await parseJson(req, customerCreate), actor.id);
});
