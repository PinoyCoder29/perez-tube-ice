/**
 * Integration tests against a REAL PostgreSQL database. They create their own products/customers (random names) and
 * assert on deltas, but they DO write rows, so use a throwaway database:
 *   RUN_DB_TESTS=1 DATABASE_URL=... DIRECT_URL=... SESSION_SECRET=... npm test
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createDelivery, changeDeliveryStatus, listDeliveries, recordDeliveryPayment } from '@/services/deliveries.service';
import { createSale, voidSale } from '@/services/sales.service';
import { voidDebtPayment } from '@/services/payments.service';
import { paymentOverview } from '@/services/overview.service';
import { getDaily } from '@/services/daily.service';
import { balanceOf } from '@/services/payments.service';
import { resolveRange, todayYmd } from '@/lib/date';
import { newKeyForTests } from './helpers';

const enabled = process.env.RUN_DB_TESTS === '1' && !!process.env.DATABASE_URL;
const d = enabled ? describe : describe.skip;

d('delivery payments, cancellation, daily totals (database)', () => {
  const tag = Math.random().toString(36).slice(2, 8);
  let staff = { id: '', name: 'Staff', role: 'STAFF' as const };
  let optionId = '';
  let productId = '';
  const today = todayYmd();

  const mkCustomer = (n: string) => prisma.customer.create({ data: { name: `T25 ${tag} ${n}`, phone: '09170000000', address: 'Test street' } });
  const mkDelivery = async (customerId: string, qty = 2, fee = '0') =>
    (await createDelivery({ customerId, scheduledDate: today, items: [{ priceOptionId: optionId, quantity: qty }], deliveryFee: fee, paymentType: 'COD', assign: true, idempotencyKey: newKeyForTests() }, staff, { allowCustom: false })).delivery;
  const row = async (id: string) => (await listDeliveries({ tab: 'all', date: today })).rows.find((r) => r.id === id)!;

  beforeAll(async () => {
    const u = await prisma.user.upsert({ where: { username: 'staff' }, update: {}, create: { name: 'Staff', username: 'staff', role: 'STAFF' } });
    staff = { id: u.id, name: u.name, role: 'STAFF' };
    const p = await prisma.product.create({ data: { name: `T25 Ice ${tag}`, priceOptions: { create: { label: '₱100', sellingPrice: '100.00' } } }, include: { priceOptions: true } });
    productId = p.id;
    optionId = p.priceOptions[0].id;
  });

  it('a delivered order can remain unpaid (and becomes utang)', async () => {
    const c = await mkCustomer('unpaid');
    const del = await mkDelivery(c.id);
    await changeDeliveryStatus(del.id, { status: 'DELIVERED' }, staff);
    const r = await row(del.id);
    expect(r.status).toBe('DELIVERED');
    expect(r.paymentStatus).toBe('UNPAID');
    expect(Number(r.amountDue)).toBe(200);
    expect(Number(await balanceOf(prisma, c.id))).toBe(200);
  });

  it('a delivered order can be paid by Cash or GCash at the door', async () => {
    const c = await mkCustomer('paid');
    const cash = await mkDelivery(c.id);
    await changeDeliveryStatus(cash.id, { status: 'DELIVERED', payments: [{ method: 'CASH', amount: '200.00' }] }, staff);
    expect((await row(cash.id)).paymentStatus).toBe('PAID');
    const g = await mkDelivery(c.id);
    await changeDeliveryStatus(g.id, { status: 'DELIVERED', payments: [{ method: 'GCASH', amount: '200.00', reference: 'GC123' }] }, staff);
    const gr = await row(g.id);
    expect(gr.paymentStatus).toBe('PAID');
    expect(gr.gcashAmount).toBe(200);
    expect(Number(await balanceOf(prisma, c.id))).toBe(0);
  });

  it('partial payments reduce the balance by exactly the amount received', async () => {
    const c = await mkCustomer('partial');
    const del = await mkDelivery(c.id);
    await recordDeliveryPayment(del.id, { idempotencyKey: newKeyForTests(), method: 'CASH', amount: '80.00' }, staff);
    let r = await row(del.id);
    expect(r.paymentStatus).toBe('PARTIAL');
    expect(Number(r.amountDue)).toBe(120);
    await recordDeliveryPayment(del.id, { idempotencyKey: newKeyForTests(), method: 'GCASH', amount: '20.00', reference: 'X1' }, staff);
    r = await row(del.id);
    expect(Number(r.amountDue)).toBe(100);
    expect(Number(await balanceOf(prisma, c.id))).toBe(100);
    await expect(recordDeliveryPayment(del.id, { idempotencyKey: newKeyForTests(), method: 'CASH', amount: '101.00' }, staff)).rejects.toThrow();
  });

  it('GCash totals count confirmed payment records only', async () => {
    const c = await mkCustomer('gcash');
    const before = (await paymentOverview({ period: 'today' })).totals.gcashCollected;
    const del = await mkDelivery(c.id);
    await recordDeliveryPayment(del.id, { idempotencyKey: newKeyForTests(), method: 'CASH', amount: '10.00' }, staff);
    const pay = await recordDeliveryPayment(del.id, { idempotencyKey: newKeyForTests(), method: 'GCASH', amount: '50.00' }, staff);
    expect((await paymentOverview({ period: 'today' })).totals.gcashCollected).toBe(before + 50);
    const p = await prisma.payment.findFirstOrThrow({ where: { customerId: c.id, paymentMethod: 'GCASH' } });
    await voidDebtPayment(p.id, 'entered by mistake', staff.id);
    expect((await paymentOverview({ period: 'today' })).totals.gcashCollected).toBe(before);
    expect(pay.duplicate).toBe(false);
  });

  it('a duplicate payment submission is recorded once', async () => {
    const c = await mkCustomer('dup');
    const del = await mkDelivery(c.id);
    const key = newKeyForTests();
    await recordDeliveryPayment(del.id, { idempotencyKey: key, method: 'CASH', amount: '30.00' }, staff);
    const again = await recordDeliveryPayment(del.id, { idempotencyKey: key, method: 'CASH', amount: '30.00' }, staff);
    expect(again.duplicate).toBe(true);
    expect(Number((await row(del.id)).amountPaid)).toBe(30);
  });

  it('a customer-cancelled order with no sale is Cancelled history and not a sale', async () => {
    const c = await mkCustomer('cancel');
    const del = await mkDelivery(c.id);
    await changeDeliveryStatus(del.id, { status: 'CANCELLED', reason: 'Cancelled by customer' }, staff);
    const cancelled = (await listDeliveries({ tab: 'cancelled', date: today })).rows.find((r) => r.id === del.id)!;
    expect(cancelled.cancelReason).toBe('Cancelled by customer');
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(await prisma.sale.count({ where: { customerId: c.id } })).toBe(0);
    expect(Number(await balanceOf(prisma, c.id))).toBe(0);
  });

  it('cancelling an order that already has a sale/payment uses the controlled reversal and keeps the audit trail', async () => {
    const c = await mkCustomer('cancel2');
    const del = await mkDelivery(c.id);
    await recordDeliveryPayment(del.id, { idempotencyKey: newKeyForTests(), method: 'CASH', amount: '80.00' }, staff);
    await recordDeliveryPayment(del.id, { idempotencyKey: newKeyForTests(), method: 'CASH', amount: '20.00' }, staff);
    await changeDeliveryStatus(del.id, { status: 'CANCELLED', reason: 'Cancelled by customer' }, staff);
    const sale = await prisma.sale.findFirstOrThrow({ where: { customerId: c.id } });
    expect(sale.status).toBe('VOIDED');
    expect(Number(await balanceOf(prisma, c.id))).toBe(0);
    expect(await prisma.payment.count({ where: { customerId: c.id, status: 'ACTIVE' } })).toBe(0);
    const actions = (await prisma.auditLog.findMany({ where: { OR: [{ entityId: sale.id }, { entityId: del.id }] } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['SALE_VOID', 'DELIVERY_CANCEL']));
    // totals exclude the voided sale
    expect(await prisma.sale.count({ where: { customerId: c.id, status: 'COMPLETED' } })).toBe(0);
  });

  it('a delivered order cannot be cancelled with the normal cancel action', async () => {
    const c = await mkCustomer('nocancel');
    const del = await mkDelivery(c.id);
    await changeDeliveryStatus(del.id, { status: 'DELIVERED' }, staff);
    await expect(changeDeliveryStatus(del.id, { status: 'CANCELLED', reason: 'x y z' }, staff)).rejects.toThrow(/Admin/);
  });

  it('delivering twice never creates a second sale', async () => {
    const c = await mkCustomer('twice');
    const del = await mkDelivery(c.id);
    await changeDeliveryStatus(del.id, { status: 'DELIVERED' }, staff);
    await expect(changeDeliveryStatus(del.id, { status: 'DELIVERED' }, staff)).rejects.toThrow();
    expect(await prisma.sale.count({ where: { customerId: c.id } })).toBe(1);
  });

  it('custom prices are validated on the server and snapshotted', async () => {
    const mk = (price: string, allowCustom = true) =>
      createSale({ idempotencyKey: newKeyForTests(), items: [{ productId, customUnitPrice: price, quantity: 2 }], payments: [{ method: 'CASH', amount: '1.00' }] }, staff.id, { allowCustom });
    await expect(mk('0')).rejects.toThrow();
    await expect(mk('-4')).rejects.toThrow();
    await expect(mk('99999999')).rejects.toThrow(/maximum/);
    await expect(mk('10', false)).rejects.toThrow(/not allowed/);
    const ok = await createSale({ idempotencyKey: newKeyForTests(), items: [{ productId, customUnitPrice: '37.50', quantity: 2 }], payments: [{ method: 'CASH', amount: '75.00' }] }, staff.id, { allowCustom: true });
    const item = ok.sale.items[0];
    expect(Number(item.unitPrice)).toBe(37.5);
    expect(item.isCustomPrice).toBe(true);
    expect(item.packageTypeSnapshot).toBe('CUSTOM');
    expect(Number(ok.sale.totalAmount)).toBe(75);
    await voidSale(ok.sale.id, 'test cleanup', staff.id);
  });

  it('daily totals reconcile with sales, payments, debt and expense records', async () => {
    const daily = await getDaily(today, 'ADMIN');
    const range = resolveRange('custom', { from: today, to: today });
    const inRange = { gte: range.start, lt: range.end };
    const sales = await prisma.sale.aggregate({ where: { status: 'COMPLETED', createdAt: inRange }, _sum: { totalAmount: true }, _count: true });
    const pays = await prisma.payment.aggregate({ where: { status: 'ACTIVE', createdAt: inRange }, _sum: { amount: true } });
    const debt = await prisma.payment.aggregate({ where: { status: 'ACTIVE', paymentType: 'DEBT_PAYMENT', createdAt: inRange }, _sum: { amount: true } });
    const exp = await prisma.expense.aggregate({ where: { status: 'ACTIVE', incurredAt: inRange }, _sum: { amount: true } });
    expect(daily.summary.totalSales).toBeCloseTo(Number(sales._sum.totalAmount ?? 0), 2);
    expect(daily.summary.transactions).toBe(sales._count);
    expect(daily.summary.cashCollections).toBeCloseTo(Number(pays._sum.amount ?? 0), 2);
    expect(daily.summary.debtCollections).toBeCloseTo(Number(debt._sum.amount ?? 0), 2);
    expect(daily.summary.expenses).toBeCloseTo(Number(exp._sum.amount ?? 0), 2);
    // yesterday works too and Staff cannot look back past the limit
    await expect(getDaily('2000-01-01', 'STAFF')).rejects.toThrow(/look back/);
    await expect(getDaily('2000-01-01', 'ADMIN')).resolves.toBeTruthy();
  });
});
