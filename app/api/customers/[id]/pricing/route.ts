import { route } from '@/lib/api';
import { applicablePricing } from '@/services/pricing.service';

// What this customer can order and at what price (customer price or standard price). Read-only; Staff and Admin.
export const GET = route(async (_req, { params }) => applicablePricing(params.id));
