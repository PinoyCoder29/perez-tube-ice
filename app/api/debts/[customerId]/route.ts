import { route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { customerLedger } from '@/services/debts.service';

export const GET = route(async (_req, { params }) => {
  await requireAdmin();
  return customerLedger(params.customerId);
});
