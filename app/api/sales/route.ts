import { route, parseJson, intParam } from '@/lib/api';
import { saleCreate } from '@/lib/validation';
import { getActor, getFullAdmin } from '@/lib/auth';
import { createSale, listSales } from '@/services/sales.service';
import type { Period } from '@/lib/date';

export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const admin = await getFullAdmin();
  const page = intParam(sp.get('page'), 1, 1, 100000);
  const pageSize = intParam(sp.get('pageSize'), 25, 1, 100);
  if (!admin) {
    // Staff only see today's transactions.
    return listSales({ period: 'today', q: sp.get('q'), page, pageSize });
  }
  const g = (k: string) => sp.get(k) || null;
  return listSales({
    period: (g('period') as Period) || undefined,
    from: g('from'),
    to: g('to'),
    productId: g('productId'),
    staffId: g('staffId'),
    customerId: g('customerId'),
    method: g('method') as never,
    paymentStatus: g('paymentStatus') as never,
    status: g('status') as never,
    q: g('q'),
    page,
    pageSize,
  });
});

export const POST = route(async (req) => {
  const actor = await getActor();
  const b = await parseJson(req, saleCreate);
  const { sale, duplicate } = await createSale(
    { idempotencyKey: b.idempotencyKey, customerId: b.customerId ?? null, items: b.items, payments: b.payments, notes: b.notes },
    actor.id,
  );
  return { sale, duplicate };
});
