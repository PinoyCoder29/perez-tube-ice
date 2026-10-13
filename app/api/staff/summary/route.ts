import { route } from '@/lib/api';
import { getStaffSummary } from '@/services/dashboard.service';

// Today's totals for the POS header / staff summary page.
export const GET = route(async () => getStaffSummary());
