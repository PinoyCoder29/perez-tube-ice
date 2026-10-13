import { route, parseJson } from '@/lib/api';
import { customerUpdate } from '@/lib/validation';
import { getFullAdmin, requireAdmin } from '@/lib/auth';
import { getCustomerDetail, updateCustomer } from '@/services/customers.service';

export const GET = route(async (_req, { params }) => {
  const admin = await getFullAdmin();
  return getCustomerDetail(params.id, { hideNotes: !admin });
});

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin();
  return updateCustomer(params.id, await parseJson(req, customerUpdate), admin.id);
});
