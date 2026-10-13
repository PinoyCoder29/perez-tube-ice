import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { D, ZERO } from '@/lib/money';
import { audit } from '@/lib/audit';
import { isUniqueViolation } from '@/lib/api';
import { nextReference, paymentStatusFor } from './sales.service';
import { resolveRange, type Period } from '@/lib/date';

export interface DebtPaymentInput {
  idempotencyKey: string;
  customerId: string;
  amount: string;
  method: PaymentMethod;
  notes?: string | null;
}

/** Pays down a customer's debt. Never a new sale. Allocates oldest-credit-first and writes a ledger entry. */
export async function recordDebtPayment(input: DebtPaymentInput, actorId: string) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const dup = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (dup) return { payment: dup, duplicate: true, balance: await balanceOf(tx, dup.customerId!) };

        // Serialise concurrent payments for the same customer.
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${input.customerId} FOR UPDATE`;
        const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!customer) throw new HttpError(404, 'Customer not found.');

        const amount = D(input.amount);
        const balance = await balanceOf(tx, customer.id);
        if (balance.lte(0)) throw new HttpError(400, 'This customer has no outstanding balance.');
        if (amount.gt(balance)) throw new HttpError(400, `Payment is more than the outstanding balance (${balance.toFixed(2)}).`);

        const payment = await tx.payment.create({
          data: {
            paymentReference: await nextReference(tx, 'PAY'),
            idempotencyKey: input.idempotencyKey,
            customerId: customer.id,
            amount,
            paymentMethod: input.method,
            paymentType: 'DEBT_PAYMENT',
            receivedById: actorId,
            notes: input.notes ?? null,
          },
        });
        await tx.ledgerEntry.create({
          data: { customerId: customer.id, type: 'PAYMENT', amount: amount.neg(), paymentId: payment.id, note: input.notes ?? 'Debt payment', recordedById: actorId },
        });

        let remaining = amount;
        const sales = await tx.sale.findMany({
          where: { customerId: customer.id, status: 'COMPLETED', paymentStatus: { not: 'PAID' } },
          orderBy: { createdAt: 'asc' },
        });
        for (const s of sales) {
          if (remaining.lte(0)) break;
          const due = s.totalAmount.minus(s.amountPaid);
          if (due.lte(0)) continue;
          const apply = Prisma.Decimal.min(due, remaining);
          const newPaid = s.amountPaid.plus(apply);
          await tx.sale.update({ where: { id: s.id }, data: { amountPaid: newPaid, paymentStatus: paymentStatusFor(s.totalAmount, newPaid) } });
          await tx.paymentAllocation.create({ data: { paymentId: payment.id, saleId: s.id, allocatedAmount: apply } });
          remaining = remaining.minus(apply);
        }

        await audit(tx, { actorId, action: 'DEBT_PAYMENT', entityType: 'Payment', entityId: payment.id, newValues: { customerId: customer.id, amount, method: input.method } });
        return { payment, duplicate: false, balance: balance.minus(amount) };
      },
      { timeout: 20000 },
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      const dup = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (dup) return { payment: dup, duplicate: true, balance: await balanceOf(prisma, dup.customerId!) };
    }
    throw e;
  }
}

type Reader = Pick<typeof prisma, 'ledgerEntry'>;
export async function balanceOf(db: Reader, customerId: string) {
  const r = await db.ledgerEntry.aggregate({ where: { customerId }, _sum: { amount: true } });
  return r._sum.amount ?? ZERO;
}

export async function voidDebtPayment(id: string, reason: string, actorId: string) {
  return prisma.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id }, include: { allocations: true } });
      if (!payment) throw new HttpError(404, 'Payment not found.');
      if (payment.paymentType !== 'DEBT_PAYMENT') throw new HttpError(400, 'Payments made with a sale are reversed by voiding the sale.');
      if (payment.status === 'VOIDED') throw new HttpError(409, 'This payment is already voided.');
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${payment.customerId} FOR UPDATE`;

      for (const a of payment.allocations) {
        const s = await tx.sale.findUniqueOrThrow({ where: { id: a.saleId } });
        const newPaid = s.amountPaid.minus(a.allocatedAmount);
        await tx.sale.update({ where: { id: s.id }, data: { amountPaid: newPaid, paymentStatus: paymentStatusFor(s.totalAmount, newPaid) } });
      }
      await tx.payment.update({ where: { id }, data: { status: 'VOIDED', voidReason: reason, voidedAt: new Date() } });
      await tx.ledgerEntry.create({
        data: { customerId: payment.customerId!, type: 'REVERSAL', amount: payment.amount, paymentId: id, note: `Void payment ${payment.paymentReference}: ${reason}`, recordedById: actorId },
      });
      await audit(tx, { actorId, action: 'PAYMENT_VOID', entityType: 'Payment', entityId: id, previousValues: { status: 'ACTIVE' }, newValues: { status: 'VOIDED', reason } });
      return { ok: true };
    },
    { timeout: 20000 },
  );
}

export async function listPayments(f: { period?: Period; from?: string | null; to?: string | null; type?: string | null; method?: PaymentMethod | null; customerId?: string | null; page: number; pageSize: number }) {
  const range = f.period ? resolveRange(f.period, { from: f.from, to: f.to }) : null;
  const where: Prisma.PaymentWhereInput = {
    ...(range ? { createdAt: { gte: range.start, lt: range.end } } : {}),
    ...(f.type === 'DEBT_PAYMENT' || f.type === 'SALE_PAYMENT' ? { paymentType: f.type } : {}),
    ...(f.method ? { paymentMethod: f.method } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      include: { customer: { select: { id: true, name: true } }, receivedBy: { select: { name: true } }, sale: { select: { transactionNumber: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
    }),
  ]);
  return { total, page: f.page, pageSize: f.pageSize, rows };
}
