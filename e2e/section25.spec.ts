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
