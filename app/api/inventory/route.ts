import { route, parseJson } from '@/lib/api';
import { movementCreate } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { listInventory, recordMovement } from '@/services/inventory.service';

export const GET = route(async () => {
  await requireAdmin();
  return listInventory();
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  return recordMovement(await parseJson(req, movementCreate), admin.id);
});
