import { route } from '@/lib/api';
import { getFullAdmin } from '@/lib/auth';
import { getDaily } from '@/services/daily.service';
import { todayYmd } from '@/lib/date';

export const GET = route(async (req) => {
  const admin = await getFullAdmin();
  const date = req.nextUrl.searchParams.get('date') || todayYmd();
  return getDaily(date, admin ? 'ADMIN' : 'STAFF');
});
