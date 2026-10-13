import { route } from '@/lib/api';
import { getSale } from '@/services/sales.service';

// Receipts and detail views. Sale ids are unguessable (cuid); staff-level access is intentionally passwordless.
export const GET = route(async (_req, { params }) => getSale(params.id));
