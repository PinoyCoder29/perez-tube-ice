import { route, parseJson, intParam } from '@/lib/api';
import { debtPaymentCreate } from '@/lib/validation';
import { getActor, getFullAdmin } from '@/lib/auth';
import { listPayments, recordDebtPayment } from '@/services/payments.service';
import type { Period } from '@/lib/date';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  const page = intParam(sp.get('page'), 1, 1, 100000);
  const pageSize = intParam(sp.get('pageSize'), 25, 1, 100);
  if (!admin) return listPayments({ period: 'today', page, pageSize });
  const g = (k: string) => sp.get(k) || null;
  return listPayments({ period: (g('period') as Period) || undefined, from: g('from'), to: g('to'), type: g('type'), method: g('method') as never, customerId: g('customerId'), page, pageSize });
});

export const POST = route(async (req) => {
  const actor = await getActor();
  const b = await parseJson(req, debtPaymentCreate);
  const r = await recordDebtPayment(b, actor.id);
  return { payment: r.payment, duplicate: r.duplicate, balance: r.balance };
});
