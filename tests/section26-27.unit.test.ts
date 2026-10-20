import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { pickTier, resolveUnitPrice, unitForQty, type Tier } from '@/lib/pricing';
import { customerPriceCreate, deliveryCreate } from '@/lib/validation';
import manifest from '../app/manifest';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
const now = new Date('2026-10-18T00:00:00Z');
const tier = (o: Partial<Tier> = {}): Tier => ({ id: 't', minQuantity: 1, price: '70.00', effectiveFrom: new Date('2026-01-01'), active: true, updatedAt: new Date('2026-02-01'), ...o });

describe('customer pricing rules', () => {
  it('customer price beats standard price', () => {
    expect(resolveUnitPrice({ standard: '100.00', tiers: [tier({ price: '80.00' })], qty: 1, now })).toMatchObject({ price: '80.00', source: 'CUSTOMER' });
  });
  it('falls back to the standard price when no customer price applies', () => {
    expect(resolveUnitPrice({ standard: '100.00', tiers: [], qty: 2, now })).toMatchObject({ price: '100.00', source: 'STANDARD' });
    expect(resolveUnitPrice({ standard: '100.00', tiers: [tier({ active: false })], qty: 2, now })?.source).toBe('STANDARD');
    expect(resolveUnitPrice({ standard: '100.00', tiers: [tier({ effectiveFrom: new Date('2027-01-01') })], qty: 2, now })?.source).toBe('STANDARD');
  });
  it('returns null (caller must reject) when no valid price exists — never a substitute', () => {
    expect(resolveUnitPrice({ standard: null, tiers: [], qty: 1, now })).toBeNull();
    expect(resolveUnitPrice({ standard: null, tiers: [tier({ active: false })], qty: 1, now })).toBeNull();
    expect(resolveUnitPrice({ standard: null, tiers: [tier({ minQuantity: 3 })], qty: 2, now })).toBeNull();
  });
  it('quantity rules apply only when the explicit minimum is met (no automatic discounts)', () => {
    const tiers = [tier({ id: 'a', minQuantity: 1, price: '80.00' }), tier({ id: 'b', minQuantity: 3, price: '70.00' })];
    expect(pickTier(tiers, 2, now)?.id).toBe('a');
    expect(pickTier(tiers, 3, now)?.id).toBe('b');
    expect(pickTier(tiers, 10, now)?.id).toBe('b');
    expect(resolveUnitPrice({ standard: '100.00', tiers: [tier({ minQuantity: 3, price: '70.00' })], qty: 2, now })?.price).toBe('100.00');
  });
  it('client preview matches the rule', () => {
    expect(unitForQty('100.00', [{ minQuantity: 2, price: '90.00' }], 1)).toEqual({ price: '100.00', source: 'STANDARD' });
    expect(unitForQty('100.00', [{ minQuantity: 2, price: '90.00' }], 2)).toEqual({ price: '90.00', source: 'CUSTOMER' });
    expect(unitForQty(null, [], 1)).toBeNull();
  });
});

describe('delivery order validation', () => {
  const base = { idempotencyKey: 'abcdefgh1', customerId: 'c1', scheduledDate: '2026-10-20' };
  it('accepts mixed package and custom lines; the browser cannot send a package price', () => {
    const r = deliveryCreate.safeParse({ ...base, items: [{ priceOptionId: 'o1', quantity: 3, unitPrice: '1.00' }, { productId: 'p1', customUnitPrice: '37.50', quantity: 1 }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.items[0]).not.toHaveProperty('unitPrice');
  });
  it('rejects bad custom prices, empty orders and missing idempotency keys', () => {
    expect(deliveryCreate.safeParse({ ...base, items: [{ productId: 'p1', customUnitPrice: '-1', quantity: 1 }] }).success).toBe(false);
    expect(deliveryCreate.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(deliveryCreate.safeParse({ customerId: 'c1', scheduledDate: '2026-10-20', items: [{ priceOptionId: 'o', quantity: 1 }] }).success).toBe(false);
  });
  it('validates admin customer-price input', () => {
    expect(customerPriceCreate.safeParse({ priceOptionId: 'o', sellingPrice: '70', minQuantity: 1 }).success).toBe(true);
    expect(customerPriceCreate.safeParse({ priceOptionId: 'o', sellingPrice: '0' }).success).toBe(false);
    expect(customerPriceCreate.safeParse({ priceOptionId: 'o', sellingPrice: '10', minQuantity: 0 }).success).toBe(false);
  });
});

describe('PWA configuration', () => {
  const m = manifest();
  it('has a valid manifest', () => {
    expect(m.name).toBe('Perez Ice Business Management System');
    expect(m.short_name).toBe('Perez Ice');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.theme_color).toMatch(/^#/);
    expect(m.icons?.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(m.icons?.some((i) => i.sizes === '192x192')).toBe(true);
    expect(m.icons?.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
  });
  it('icon files are real PNGs with the declared size', () => {
    for (const icon of m.icons ?? []) {
      const buf = fs.readFileSync(path.join(root, 'public', icon.src));
      expect(buf.subarray(1, 4).toString()).toBe('PNG');
      const [w, h] = (icon.sizes ?? '').split('x').map(Number);
      expect(buf.readUInt32BE(16)).toBe(w);
      expect(buf.readUInt32BE(20)).toBe(h);
    }
    expect(fs.existsSync(path.join(root, 'public/icons/apple-touch-icon.png'))).toBe(true);
  });
  it('service worker never caches API data or pages and waits before updating', () => {
    const sw = read('app/sw.ts');
    expect(sw).toMatch(/startsWith\('\/api\/'\)[\s\S]{0,120}NetworkOnly/);
    expect(sw).toMatch(/request\.mode === 'navigate'[\s\S]{0,80}NetworkOnly/);
    expect(sw).not.toMatch(/defaultCache/);
    expect(sw).toMatch(/skipWaiting: false/);
    expect(read('next.config.mjs')).toMatch(/no-store/);
  });
  it('offline UI blocks saving and never claims a save', () => {
    expect(read('lib/client/api.ts')).toMatch(/Nothing was saved/);
    expect(read('app/staff/pos/page.tsx')).toMatch(/disabled=\{busy \|\| !online/);
  });
});

describe('mobile navigation', () => {
  it('uses bottom navigation only, with no duplicate top nav row', () => {
    const admin = read('components/layout/AdminShell.tsx');
    expect(admin).not.toMatch(/admin-topbar/);
    for (const l of ['Dashboard', 'Sales', 'Deliveries', 'Customers', 'More']) expect(admin).toContain(`'${l}'`.replace("'More'", 'More'));
    const staff = read('components/layout/StaffShell.tsx');
    expect(staff).toMatch(/'POS'/); expect(staff).toMatch(/'Deliveries'/); expect(staff).toMatch(/'Customers'/); expect(staff).toMatch(/Utang \/ Pay/);
    expect(staff).toMatch(/desk-links/); // global links are desktop-only; hidden on phones by CSS
    expect(read('app/globals.css')).toMatch(/\.staff-top \.desk-links \{ display: none; \}/);
  });
});


describe('admin-only customers and shared delivery logic', () => {
  it('customer creation is Admin-only on the server and absent from Staff screens', () => {
    expect(read('app/api/customers/route.ts')).toMatch(/POST = route\(async \(req\) => \{\s*const admin = await requireAdmin\(\)/);
    for (const f of ['app/staff/customers/page.tsx', 'app/staff/deliveries/page.tsx', 'app/staff/pos/page.tsx', 'components/customers/CustomerShortcut.tsx', 'components/deliveries/CustomersTab.tsx']) {
      expect(read(f)).not.toMatch(/CustomerForm/);
    }
    expect(read('components/customers/CustomerPicker.tsx')).toMatch(/allowCreate = false/);
    expect(read('app/staff/customers/page.tsx')).toMatch(/Only the Admin can add new customers/);
  });
  it('the customer shortcut and Staff Deliveries use one DeliveryForm with a Confirm Delivery button', () => {
    expect(read('components/customers/CustomerShortcut.tsx')).toMatch(/<DeliveryForm inline/);
    expect(read('app/staff/deliveries/page.tsx')).toMatch(/<DeliveryForm/);
    expect(read('components/deliveries/DeliveryForm.tsx')).toMatch(/Confirm Delivery/);
    expect(read('components/deliveries/DeliveryForm.tsx')).toMatch(/idempotencyKey: orderKey\.current/);
  });
  it('admin does not assign deliveries to Staff', () => {
    expect(read('components/deliveries/DeliveryBoard.tsx')).not.toMatch(/Assign to Staff/);
  });
  it('new-customer input accepts prices per package and rejects bad prices', async () => {
    const { customerCreateWithPrices } = await import('@/lib/validation');
    const base = { name: 'Juan', phone: '09171234567', address: 'Rizal St' };
    expect(customerCreateWithPrices.safeParse({ ...base, prices: [{ priceOptionId: 'a', sellingPrice: '35.00' }, { priceOptionId: 'b', sellingPrice: '70' }] }).success).toBe(true);
    expect(customerCreateWithPrices.safeParse({ ...base, prices: [{ priceOptionId: 'a', sellingPrice: '0' }] }).success).toBe(false);
    expect(customerCreateWithPrices.safeParse({ ...base, phone: '12345' }).success).toBe(false);
  });
});
