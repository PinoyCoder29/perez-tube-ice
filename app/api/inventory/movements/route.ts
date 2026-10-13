import { route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { listMovements } from '@/services/inventory.service';

export const GET = route(async (req) => {
  await requireAdmin();
  return listMovements(req.nextUrl.searchParams.get('productId'));
});
