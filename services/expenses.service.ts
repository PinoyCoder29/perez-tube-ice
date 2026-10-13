import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D } from '@/lib/money';
import { audit } from '@/lib/audit';
import { resolveRange, type Period } from '@/lib/date';

export interface ExpenseInput {
  category: string;
  description: string;
  amount: string;
  paymentMethod: PaymentMethod;
  incurredAt?: string;
  receiptRef?: string | null;
  notes?: string | null;
}

export async function createExpense(input: ExpenseInput, actorId: string) {
  const e = await prisma.expense.create({
    data: {
      category: input.category,
      description: input.description,
      amount: D(input.amount),
      paymentMethod: input.paymentMethod,
      staffId: actorId,
      incurredAt: input.incurredAt ? new Date(input.incurredAt) : new Date(),
      receiptRef: input.receiptRef ?? null,
      notes: input.notes ?? null,
    },
  });
  await audit(prisma, { actorId, action: 'EXPENSE_CREATE', entityType: 'Expense', entityId: e.id, newValues: e });
  return e;
}

export async function updateExpense(id: string, patch: Partial<ExpenseInput>, actorId: string) {
  const before = await prisma.expense.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Expense not found.');
  if (before.status === 'VOIDED') throw new HttpError(409, 'Voided expenses cannot be edited.');
  const data: Prisma.ExpenseUpdateInput = {};
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.amount !== undefined) data.amount = D(patch.amount);
  if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
  if (patch.incurredAt !== undefined) data.incurredAt = new Date(patch.incurredAt);
  if (patch.receiptRef !== undefined) data.receiptRef = patch.receiptRef;
  if (patch.notes !== undefined) data.notes = patch.notes;
  const after = await prisma.expense.update({ where: { id }, data });
  await audit(prisma, { actorId, action: 'EXPENSE_UPDATE', entityType: 'Expense', entityId: id, previousValues: before, newValues: after });
  return after;
}

export async function voidExpense(id: string, reason: string, actorId: string) {
  const before = await prisma.expense.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, 'Expense not found.');
  if (before.status === 'VOIDED') throw new HttpError(409, 'Already voided.');
  const after = await prisma.expense.update({ where: { id }, data: { status: 'VOIDED', voidReason: reason, voidedAt: new Date(), voidedById: actorId } });
  await audit(prisma, { actorId, action: 'EXPENSE_VOID', entityType: 'Expense', entityId: id, previousValues: { status: before.status }, newValues: { status: 'VOIDED', reason } });
  return after;
}

export async function listExpenses(f: { period?: Period; from?: string | null; to?: string | null; category?: string | null; staffId?: string | null; includeVoided?: boolean; page: number; pageSize: number }) {
  const range = f.period ? resolveRange(f.period, { from: f.from, to: f.to }) : null;
  const where: Prisma.ExpenseWhereInput = {
    ...(range ? { incurredAt: { gte: range.start, lt: range.end } } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.staffId ? { staffId: f.staffId } : {}),
    ...(f.includeVoided ? {} : { status: 'ACTIVE' }),
  };
  const [total, rows, agg] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({ where, include: { staff: { select: { name: true } } }, orderBy: { incurredAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.expense.aggregate({ where: { ...where, status: 'ACTIVE' }, _sum: { amount: true } }),
  ]);
  return { total, page: f.page, pageSize: f.pageSize, rows, activeTotal: agg._sum.amount ?? D(0) };
}
