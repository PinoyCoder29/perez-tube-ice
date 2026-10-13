import { prisma } from '@/lib/db/prisma';
import { route, intParam } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { resolveRange, type Period } from '@/lib/date';
import { num } from '@/lib/money';

export const GET = route(async (req) => {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const period = (['today', 'week', 'month', 'year', 'custom'].includes(sp.get('period') ?? '') ? sp.get('period') : 'today') as Period;
  const range = resolveRange(period, { from: sp.get('from'), to: sp.get('to') });
  const action = sp.get('action');
  const entity = sp.get('entityType');
  const page = intParam(sp.get('page'), 1, 1, 100000);
  const pageSize = 50;
  const where = {
    createdAt: { gte: range.start, lt: range.end },
    ...(action ? { action } : {}),
    ...(entity ? { entityType: entity } : {}),
  };
  const [total, logs, sales, expenses, payments] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.sale.groupBy({ by: ['staffId'], where: { status: 'COMPLETED', createdAt: { gte: range.start, lt: range.end } }, _count: true, _sum: { totalAmount: true } }),
    prisma.expense.groupBy({ by: ['staffId'], where: { status: 'ACTIVE', incurredAt: { gte: range.start, lt: range.end } }, _count: true, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['receivedById'], where: { status: 'ACTIVE', createdAt: { gte: range.start, lt: range.end } }, _count: true, _sum: { amount: true } }),
  ]);
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true } });
  const byUser = users
    .map((u) => ({
      userId: u.id,
      name: u.name,
      role: u.role,
      sales: sales.find((s) => s.staffId === u.id)?._count ?? 0,
      salesTotal: num(sales.find((s) => s.staffId === u.id)?._sum.totalAmount),
      expenses: expenses.find((s) => s.staffId === u.id)?._count ?? 0,
      expensesTotal: num(expenses.find((s) => s.staffId === u.id)?._sum.amount),
      payments: payments.find((s) => s.receivedById === u.id)?._count ?? 0,
      paymentsTotal: num(payments.find((s) => s.receivedById === u.id)?._sum.amount),
    }))
    .filter((u) => u.sales || u.expenses || u.payments);
  return { total, page, pageSize, logs, byUser, note: 'Staff access is shared and passwordless, so all staff actions are recorded under the single "Staff" identity.' };
});
