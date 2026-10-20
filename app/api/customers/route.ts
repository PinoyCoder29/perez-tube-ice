import { route, parseJson, intParam } from '@/lib/api';
import { customerCreateWithPrices } from '@/lib/validation';
import { getFullAdmin, requireAdmin } from '@/lib/auth';
import { createCustomerWithPrices, listCustomers } from '@/services/customers.service';

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

// Only Admin can create permanent customer records (with their prices). Staff pick from existing customers.
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const { prices, ...data } = await parseJson(req, customerCreateWithPrices);
  return createCustomerWithPrices(data, prices, admin.id);
});
