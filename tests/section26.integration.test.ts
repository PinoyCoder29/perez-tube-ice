/** Database integration tests for Section 26. Same rules as section25.integration (RUN_DB_TESTS=1, throwaway database). */
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createDelivery, changeDeliveryStatus, listDeliveries, recordDeliveryPayment } from '@/services/deliveries.service';
import { createCustomerPrice, updateCustomerPrice, applicablePricing } from '@/services/pricing.service';
import { listCustomers, createCustomerWithPrices } from '@/services/customers.service';
import { recordDebtPayment, balanceOf } from '@/services/payments.service';
import { todayYmd } from '@/lib/date';
import { newKeyForTests } from './helpers';

const enabled = process.env.RUN_DB_TESTS === '1' && !!process.env.DATABASE_URL;
const d = enabled ? describe : describe.skip;

d('staff-managed deliveries, customer pricing, sacks (database)', () => {
  const tag = Math.random().toString(36).slice(2, 8);
  const today = todayYmd();
  let staff = { id: '', name: 'Staff', role: 'STAFF' as const };
  let admin = { id: '', name: 'Admin', role: 'ADMIN' as const };
  let productId = '';
  let full = '', half = '', retail = '', hidden = '';

  const mkCustomer = (n: string, address = 'Rizal St') => prisma.customer.create({ data: { name: `T26 ${tag} ${n}`, phone: '09175550000', address } });
  const order = (customerId: string, items: { priceOptionId: string; quantity: number }[], extra: Record<string, unknown> = {}) =>
    createDelivery({ customerId, scheduledDate: today, items, paymentType: 'COD', idempotencyKey: newKeyForTests(), ...extra } as never, staff, { allowCustom: false });

  beforeAll(async () => {
    const s = await prisma.user.upsert({ where: { username: 'staff' }, update: {}, create: { name: 'Staff', username: 'staff', role: 'STAFF' } });
    staff = { id: s.id, name: s.name, role: 'STAFF' };
    const a = await prisma.user.upsert({ where: { username: `t26admin${tag}` }, update: {}, create: { name: 'T26 Admin', username: `t26admin${tag}`, role: 'ADMIN' } });
    admin = { id: a.id, name: a.name, role: 'ADMIN' };
    const p = await prisma.product.create({
      data: {
        name: `T26 Tube ${tag}`, inventoryTrackingEnabled: true, enforceStock: true, currentStock: '10',
        priceOptions: {
          create: [
            { label: 'Full Sack', packageType: 'FULL_SACK', sellingPrice: '70.00', sacksPerUnit: '1', inventoryQuantityPerUnit: '1', sortOrder: 2 },
            { label: 'Half Sack', packageType: 'HALF_SACK', sellingPrice: '40.00', sacksPerUnit: '0.5', inventoryQuantityPerUnit: '0.5', sortOrder: 1 },
            { label: 'Retail ₱10', packageType: 'RETAIL', sellingPrice: '10.00', sortOrder: 3 }, // no stock conversion configured
            { label: 'Special 2 Sacks', packageType: 'MULTI_SACK', sellingPrice: '999.00', sacksPerUnit: '2', active: false, sortOrder: 4 }, // no standard price
          ],
        },
      },
      include: { priceOptions: true },
    });
    productId = p.id;
    const by = (l: string) => p.priceOptions.find((o) => o.label === l)!.id;
    full = by('Full Sack'); half = by('Half Sack'); retail = by('Retail ₱10'); hidden = by('Special 2 Sacks');
  });

  it('staff create an order directly (no assignment); creating it records no sale, payment, debt or stock movement', async () => {
    const c = await mkCustomer('direct');
    const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock;
    const { delivery } = await order(c.id, [{ priceOptionId: full, quantity: 1 }]);
    expect(delivery.status).toBe('PENDING');
    expect(delivery.assignedStaffId).toBeNull();
    expect(await prisma.sale.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.payment.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.ledgerEntry.count({ where: { customerId: c.id } })).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock.toString()).toBe(stockBefore.toString());
    await changeDeliveryStatus(delivery.id, { status: 'OUT_FOR_DELIVERY' }, staff); // staff move it without Admin
  });

  it('All Customers vs Delivery Orders: a customer with no order is listed but has no delivery', async () => {
    const c = await mkCustomer('never ordered', 'Unique Landmark Road 77');
    const listed = (await listCustomers({ q: 'Unique Landmark Road 77' })).rows.map((r) => r.id);
    expect(listed).toContain(c.id);
    expect((await listDeliveries({ customerId: c.id, all: true })).rows).toHaveLength(0);
    const byPhone = await listCustomers({ q: '09175550000' });
    expect(byPhone.rows.some((r) => r.id === c.id)).toBe(true);
    const byName = await listCustomers({ q: `T26 ${tag} never` });
    expect(byName.rows.map((r) => r.id)).toContain(c.id);
  });

  it('customer prices beat standard prices, apply per customer, and use quantity rules only when configured', async () => {
    const a = await mkCustomer('priceA');
    const b = await mkCustomer('priceB');
    await createCustomerPrice(a.id, { priceOptionId: full, sellingPrice: '60.00', minQuantity: 1 }, admin.id);
    await createCustomerPrice(a.id, { priceOptionId: full, sellingPrice: '55.00', minQuantity: 3 }, admin.id);
    const two = (await order(a.id, [{ priceOptionId: full, quantity: 2 }])).delivery;
    expect(Number(two.orderTotal)).toBe(120);
    expect(two.items[0].pricingSource).toBe('CUSTOMER');
    const three = (await order(a.id, [{ priceOptionId: full, quantity: 3 }])).delivery;
    expect(Number(three.orderTotal)).toBe(165); // explicit 3+ rule
    const other = (await order(b.id, [{ priceOptionId: full, quantity: 3 }])).delivery;
    expect(Number(other.orderTotal)).toBe(210); // other customers: standard, no automatic discount
    expect(other.items[0].pricingSource).toBe('STANDARD');
    const shown = (await applicablePricing(a.id)).find((p) => p.id === productId)!.options.find((o) => o.id === full)!;
    expect(shown.tiers.map((t) => t.price)).toEqual(['60.00', '55.00']);
  });

  it('confirmed snapshots do not change after price updates; new orders use the new price', async () => {
    const c = await mkCustomer('snap');
    const cp = await createCustomerPrice(c.id, { priceOptionId: half, sellingPrice: '30.00', minQuantity: 1 }, admin.id);
    const first = (await order(c.id, [{ priceOptionId: half, quantity: 2 }])).delivery;
    await updateCustomerPrice(cp.id, { sellingPrice: '35.00' }, admin.id);
    await prisma.priceOption.update({ where: { id: half }, data: { sellingPrice: '45.00' } });
    const again = await prisma.delivery.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } });
    expect(Number(again.items[0].unitPrice)).toBe(30);
    expect(Number(again.orderTotal)).toBe(60);
    const next = (await order(c.id, [{ priceOptionId: half, quantity: 2 }])).delivery;
    expect(Number(next.orderTotal)).toBe(70);
    expect(await prisma.customerPriceHistory.count({ where: { customerPriceId: cp.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { entityId: cp.id, entityType: 'CustomerPrice' } })).toBeGreaterThanOrEqual(2);
    await prisma.priceOption.update({ where: { id: half }, data: { sellingPrice: '40.00' } });
  });

  it('missing, inactive or unusable prices are rejected', async () => {
    const c = await mkCustomer('noprice');
    await expect(order(c.id, [{ priceOptionId: hidden, quantity: 1 }])).rejects.toThrow(/No valid price/);
    const cp = await createCustomerPrice(c.id, { priceOptionId: hidden, sellingPrice: '120.00', minQuantity: 1 }, admin.id);
    expect(Number((await order(c.id, [{ priceOptionId: hidden, quantity: 1 }])).delivery.orderTotal)).toBe(120);
    await updateCustomerPrice(cp.id, { active: false }, admin.id);
    await expect(order(c.id, [{ priceOptionId: hidden, quantity: 1 }])).rejects.toThrow(/No valid price/);
    await expect(order(c.id, [{ priceOptionId: 'does-not-exist', quantity: 1 }])).rejects.toThrow();
  });

  it('mixes products/packages in one order; half sacks stay separate; stock uses configured conversions only', async () => {
    const c = await mkCustomer('sacks');
    const stockBefore = Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock);
    const { delivery } = await order(c.id, [
      { priceOptionId: full, quantity: 3 }, { priceOptionId: half, quantity: 2 }, { priceOptionId: retail, quantity: 4 },
    ]);
    expect(Number(delivery.orderTotal)).toBe(3 * 70 + 2 * 40 + 4 * 10); // 330
    expect(delivery.items.map((i) => i.packageTypeSnapshot).sort()).toEqual(['FULL_SACK', 'HALF_SACK', 'RETAIL']);
    await changeDeliveryStatus(delivery.id, { status: 'DELIVERED', payments: [{ method: 'CASH', amount: '330.00' }] }, staff);
    const stockAfter = Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock);
    expect(stockBefore - stockAfter).toBe(3 * 1 + 2 * 0.5); // retail packs consumed nothing: no conversion configured
    const sale = await prisma.sale.findFirstOrThrow({ where: { customerId: c.id }, include: { items: true } });
    expect(sale.items.reduce((a, i) => a + Number(i.sacks), 0)).toBe(4);
    expect(await prisma.inventoryMovement.count({ where: { referenceType: 'Sale', referenceId: sale.id } })).toBe(1);
  });

  it('duplicate submissions create one order and one payment', async () => {
    const c = await mkCustomer('dupes');
    const key = newKeyForTests();
    const payKey = newKeyForTests();
    const input = { customerId: c.id, scheduledDate: today, items: [{ priceOptionId: full, quantity: 1 }], paymentType: 'COD' as const, idempotencyKey: key, payment: { idempotencyKey: payKey, method: 'GCASH' as const, amount: '70.00', reference: 'REF1' } };
    const one = await createDelivery(input, staff, { allowCustom: false });
    const two = await createDelivery(input, staff, { allowCustom: false });
    expect(two.duplicate).toBe(true);
    expect(two.delivery.id).toBe(one.delivery.id);
    expect(await prisma.delivery.count({ where: { customerId: c.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { customerId: c.id } })).toBe(1);
    expect(await prisma.sale.count({ where: { customerId: c.id } })).toBe(1);
  });

  it('cash, GCash, partial and credit create real records; debt collection never creates a sale', async () => {
    const c = await mkCustomer('money');
    const { delivery } = await order(c.id, [{ priceOptionId: full, quantity: 2 }]); // 140
    await changeDeliveryStatus(delivery.id, { status: 'DELIVERED', payments: [{ method: 'GCASH', amount: '40.00', reference: 'G-1' }] }, staff);
    let row = (await listDeliveries({ customerId: c.id, all: true })).rows[0];
    expect(row.status).toBe('DELIVERED');
    expect(row.paymentStatus).toBe('PARTIAL'); // delivered but not fully paid
    expect(Number(row.amountDue)).toBe(100);
    const sales = await prisma.sale.count({ where: { customerId: c.id } });
    await recordDebtPayment({ idempotencyKey: newKeyForTests(), customerId: c.id, amount: '60.00', method: 'CASH' }, staff.id);
    expect(await prisma.sale.count({ where: { customerId: c.id } })).toBe(sales); // no new sale
    expect(Number(await balanceOf(prisma, c.id))).toBe(40);
    await recordDeliveryPayment(delivery.id, { idempotencyKey: newKeyForTests(), method: 'CASH', amount: '40.00' }, staff);
    row = (await listDeliveries({ customerId: c.id, all: true })).rows[0];
    expect(row.paymentStatus).toBe('PAID');
    expect(row.paymentMethods.map((m) => m.method).sort()).toEqual(['CASH', 'GCASH']);
    expect(row.gcashAmount).toBe(40);
  });

  it('cancelling keeps history and reverses stock and payments for an order that already had effects', async () => {
    const c = await mkCustomer('cancel');
    const stockBefore = Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock);
    const { delivery } = await order(c.id, [{ priceOptionId: full, quantity: 1 }], { payment: { idempotencyKey: newKeyForTests(), method: 'CASH', amount: '30.00' } });
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock)).toBe(stockBefore - 1);
    await changeDeliveryStatus(delivery.id, { status: 'CANCELLED', reason: 'Cancelled by customer' }, staff);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).currentStock)).toBe(stockBefore);
    expect(Number(await balanceOf(prisma, c.id))).toBe(0);
    const kept = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(kept.status).toBe('CANCELLED');
    expect(kept.cancelReason).toBe('Cancelled by customer');
    expect(await prisma.sale.count({ where: { customerId: c.id } })).toBe(1); // sale kept, voided
    await expect(changeDeliveryStatus(delivery.id, { status: 'DELIVERED' }, staff)).rejects.toThrow();
  });

  it('staff cannot use custom prices when not permitted, and server rejects bad custom prices', async () => {
    const c = await mkCustomer('custom');
    const mk = (price: string, allowCustom: boolean) =>
      createDelivery({ customerId: c.id, scheduledDate: today, items: [{ productId, customUnitPrice: price, quantity: 1 }], paymentType: 'COD', idempotencyKey: newKeyForTests() }, staff, { allowCustom });
    await expect(mk('25.00', false)).rejects.toThrow(/not allowed/);
    await expect(mk('0', true)).rejects.toThrow();
    await expect(mk('99999999', true)).rejects.toThrow(/maximum/);
    const ok = await mk('25.00', true);
    expect(ok.delivery.items[0].isCustomPrice).toBe(true);
    expect(ok.delivery.items[0].pricingSource).toBe('CUSTOM');
  });

  it('Admin creates a customer with prices; they are immediately available to Staff and used on orders and history', async () => {
    const c = await createCustomerWithPrices(
      { name: `T26 ${tag} newcust`, phone: '09175551234', address: 'Mabini St', landmark: null, notes: null },
      [{ priceOptionId: half, sellingPrice: '33.00', minQuantity: 1 }, { priceOptionId: full, sellingPrice: '66.00', minQuantity: 1 }],
      admin.id,
    );
    const listed = (await listCustomers({ q: `T26 ${tag} newcust` })).rows[0];
    expect(listed.id).toBe(c.id);
    expect(listed.completedDeliveries).toBe(0);
    expect(listed.lastDeliveryAt).toBeNull();
    const opts = (await applicablePricing(c.id)).find((p) => p.id === productId)!.options;
    expect(opts.find((o) => o.id === half)!.tiers[0].price).toBe('33.00'); // configured, not half of the full-sack price
    const { delivery } = await order(c.id, [{ priceOptionId: half, quantity: 2 }, { priceOptionId: full, quantity: 1 }]);
    expect(Number(delivery.orderTotal)).toBe(2 * 33 + 66);
    await changeDeliveryStatus(delivery.id, { status: 'DELIVERED' }, staff); // delivered but still unpaid
    const after = (await listCustomers({ q: `T26 ${tag} newcust` })).rows[0];
    expect(after.completedDeliveries).toBe(1);
    expect(after.lastDeliveryAt).toBeTruthy();
    expect(Number(after.outstandingBalance)).toBe(132);
    await expect(createCustomerWithPrices({ name: 'dup', phone: '09175551234', address: 'x', landmark: null, notes: null }, [{ priceOptionId: full, sellingPrice: '1.00', minQuantity: 1 }, { priceOptionId: full, sellingPrice: '2.00', minQuantity: 1 }], admin.id)).rejects.toThrow(/twice/);
    expect(await prisma.customer.count({ where: { name: 'dup' } })).toBe(0); // nothing half-saved
  });
});
