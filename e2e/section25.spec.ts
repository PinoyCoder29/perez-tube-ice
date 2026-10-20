/**
 * Browser tests for Section 25. Prerequisites: migrated + seeded database, app running (or E2E_BASE_URL),
 * and for the Admin tests: E2E_ADMIN_USER / E2E_ADMIN_PASSWORD (a password that has already been changed from the initial one).
 */
import { expect, test, type Page } from '@playwright/test';

const adminUser = process.env.E2E_ADMIN_USER ?? 'admin';
const adminPass = process.env.E2E_ADMIN_PASSWORD;

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}
async function adminLogin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Username').fill(adminUser);
  await page.getByLabel('Password').fill(adminPass!);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/admin/dashboard');
}

test('POS lists Tube Ice before Crushed Ice and fits the screen', async ({ page }) => {
  await page.goto('/staff/pos');
  const tabs = page.getByRole('tab');
  await expect(tabs.nth(0)).toHaveText('Tube Ice');
  await expect(tabs.nth(1)).toHaveText('Crushed Ice');
  await noSideScroll(page);
});

test('custom price can be added to the cart', async ({ page }) => {
  await page.goto('/staff/pos');
  await page.getByRole('button', { name: 'Custom price' }).click();
  await page.getByLabel('Price (₱)').fill('37.50');
  await page.getByLabel('Qty').fill('2');
  await page.getByRole('button', { name: 'Add to sale' }).click();
  await expect(page.getByText('Custom ₱37.50')).toBeVisible();
  await expect(page.getByText('₱75.00').first()).toBeVisible();
});

test('invalid custom price keeps Add to sale disabled', async ({ page }) => {
  await page.goto('/staff/pos');
  await page.getByRole('button', { name: 'Custom price' }).click();
  await page.getByLabel('Price (₱)').fill('-5');
  await expect(page.getByRole('button', { name: 'Add to sale' })).toBeDisabled();
});

test('staff delivery list shows balance/status without side scrolling and has filters', async ({ page }) => {
  await page.goto('/staff/deliveries');
  for (const name of ['All Deliveries', 'Pending', 'Out for Delivery', 'Delivered', 'Unpaid', 'Partially Paid', 'Paid', 'GCash', 'Cancelled']) {
    await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible();
  }
  await noSideScroll(page);
});

test('staff bottom navigation and More menu work on phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('/staff/pos');
  const nav = page.getByRole('navigation', { name: 'Staff navigation' }).last();
  for (const n of ['POS', 'Deliveries', 'Customers', 'Utang / Pay', 'More']) await expect(nav.getByText(n, { exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'More menu' }).click();
  await expect(page.getByRole('link', { name: /Expenses/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Daily Summary/ })).toBeVisible();
});

test('staff can pick yesterday on the daily summary', async ({ page }) => {
  await page.goto('/staff/summary');
  await page.getByRole('button', { name: 'Yesterday' }).click();
  await expect(page.getByText('Total confirmed sales')).toBeVisible();
});

test('Staff cannot reach Admin data or exports', async ({ request, page }) => {
  expect((await request.get('/api/reports/transactions?format=xlsx')).status()).toBe(401);
  expect((await request.get('/api/dashboard')).status()).toBe(401);
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/admin\/login/);
});

test.describe('admin', () => {
  test.skip(!adminPass, 'set E2E_ADMIN_PASSWORD');

  test('admin can download a valid .xlsx for a date range', async ({ page }) => {
    await adminLogin(page);
    const res = await page.request.get('/api/reports/transactions?period=month&format=xlsx');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('spreadsheetml');
    const body = await res.body();
    expect(body.subarray(0, 2).toString()).toBe('PK');
  });

  test('admin mobile navigation has four primary items plus More', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone only');
    await adminLogin(page);
    const nav = page.getByRole('navigation', { name: 'Primary navigation' });
    for (const n of ['Dashboard', 'Sales', 'Deliveries', 'Customers', 'More']) await expect(nav.getByText(n, { exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'More menu' }).click();
    await expect(page.getByRole('link', { name: /Products & Pricing/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Reports/ })).toBeVisible();
  });

  test('admin screens do not scroll sideways on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone only');
    await adminLogin(page);
    for (const path of ['/admin/dashboard', '/admin/customers', '/admin/debts', '/admin/deliveries', '/admin/sales', '/admin/daily', '/admin/payments']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await noSideScroll(page);
    }
  });

  test('admin daily calendar updates for yesterday', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/daily');
    await page.getByRole('button', { name: 'Yesterday' }).click();
    await expect(page.getByText('Total confirmed sales')).toBeVisible();
  });
});


// ---------- Section 26 / 27 ----------
test('staff deliveries has the two page tabs and no duplicate global tabs on phones', async ({ page, isMobile }) => {
  await page.goto('/staff/deliveries');
  await expect(page.getByRole('tab', { name: 'All Customers' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Delivery Orders' })).toBeVisible();
  if (isMobile) {
    // the only global navigation is the bottom bar: header has no navigation links
    await expect(page.locator('header.staff-top nav')).toBeHidden();
    await expect(page.locator('.admin-topbar')).toHaveCount(0);
  }
  await noSideScroll(page);
});

test('create delivery form opens from a customer card and shows prices and debt', async ({ page }) => {
  await page.goto('/staff/deliveries');
  const first = page.getByRole('button', { name: 'Create delivery' }).first();
  test.skip((await first.count()) === 0, 'needs at least one customer');
  await first.click();
  await expect(page.getByText('Outstanding debt')).toBeVisible();
  await expect(page.getByText(/Standard price|Customer price/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Delivery' })).toBeDisabled(); // nothing added yet
});

test('Staff cannot reach Admin pricing configuration', async ({ request }) => {
  expect((await request.get('/api/customers/x/prices')).status()).toBe(401);
  expect((await request.patch('/api/customer-prices/x', { data: { active: false } })).status()).toBe(401);
});

test('PWA: manifest, icons and service worker script are served; API is not cacheable', async ({ page, request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.short_name).toBe('Perez Ice');
  expect(m.display).toBe('standalone');
  for (const icon of m.icons) expect((await request.get(icon.src)).status()).toBe(200);
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  const api = await request.get('/api/settings');
  expect(api.headers()['cache-control']).toContain('no-store');
});

test('PWA (production build only): service worker registers', async ({ page }) => {
  test.skip(process.env.E2E_PRODUCTION !== '1', 'run against `npm run build && npm start` with E2E_PRODUCTION=1');
  await page.goto('/');
  const ready = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  expect(ready).toBe(true);
});

test('offline: banner appears and checkout cannot be confirmed', async ({ page, context }) => {
  await page.goto('/staff/pos');
  await page.getByRole('button').filter({ hasText: /^₱/ }).first().click();
  await context.setOffline(true);
  await expect(page.getByText(/You are offline/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm Sale/ })).toBeDisabled();
  await context.setOffline(false);
});

test('install instructions are available in Staff More (not in the bottom bar)', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('/staff/pos');
  const nav = page.getByRole('navigation', { name: 'Staff navigation' }).last();
  await expect(nav.getByText('Install', { exact: false })).toHaveCount(0);
  await nav.getByRole('button', { name: 'More menu' }).click();
  await expect(page.getByText('Install Perez Ice on this device')).toBeVisible();
});


// ---------- Admin-only customers / Staff shortcut ----------
test('Staff cannot add customers (API and UI)', async ({ request, page }) => {
  const res = await request.post('/api/customers', { data: { name: 'X', phone: '09171234567', address: 'Y', prices: [] } });
  expect(res.status()).toBe(401);
  await page.goto('/staff/customers');
  await expect(page.getByRole('button', { name: /^\+?\s*New$/ })).toHaveCount(0);
  await expect(page.getByText(/Add (new )?customer/i)).toHaveCount(0);
});

test('Staff customer details offer price buttons and Confirm Delivery (same form as Deliveries)', async ({ page }) => {
  await page.goto('/staff/customers');
  const first = page.locator('ul.list-group li button').first();
  test.skip((await first.count()) === 0, 'needs at least one customer');
  await first.click();
  await expect(page.getByText(/Standard price|Customer price/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Delivery' })).toBeDisabled(); // nothing selected yet
  await noSideScroll(page);
});

test('Staff see a clear message when a customer does not exist', async ({ page }) => {
  await page.goto('/staff/customers');
  await page.getByLabel('Search customers').fill('zzzz-no-such-customer-zzzz');
  await expect(page.getByText(/Only the Admin can add new customers/)).toBeVisible();
});

test.describe('admin customers', () => {
  test.skip(!adminPass, 'set E2E_ADMIN_PASSWORD');
  test('shows a customer count, search, delivery history columns and a prices section on New Customer', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/customers');
    await expect(page.getByText(/customers? (in total|match your search)/)).toBeVisible();
    await expect(page.getByLabel('Search customers')).toBeVisible();
    await page.getByRole('button', { name: /Add customer/ }).click();
    await expect(page.getByText('Prices for this customer')).toBeVisible();
  });
});
