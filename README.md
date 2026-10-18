# Perez Ice Business Management System

Ice sales and delivery management for a small Philippine business. Two entry points:

* **Admin** – password login. Dashboard, products & prices, customers, utang (credit) ledger, payments, deliveries, expenses, inventory, reports (CSV), audit/staff activity, settings.
* **Staff** – opens straight into the POS, **no password** (by design). Sales (cash / GCash / utang / split), customers with tap-to-call, today's transactions, debts and payment collection, delivery queue, expenses, today's summary.

Stack: Next.js 14 (App Router) · TypeScript (strict) · Bootstrap 5 · Recharts · Lucide · Prisma · PostgreSQL (Neon) · Zod · bcryptjs.

> **Status:** this code was generated without being able to run `npm install`, `next build`, a database or a browser in the build environment. Only the date/period and financial-definition logic was executed in isolation. The project as a whole — including every test file listed below — has **not been compiled or run**. Treat the first `npm run typecheck` / `npm run build` as part of setup and expect to fix a few small type or typo errors. Prisma migration files are also not included yet — see step 4.

## 1. Requirements
Node.js 18.18+ (20 recommended), a Neon (or any PostgreSQL) database.

## 2. Install
```bash
npm install
cp .env.example .env
```

## 3. Configure `.env`
| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (used by the app) |
| `DIRECT_URL` | Neon **direct** connection string (used by `prisma migrate`) |
| `APP_URL` | e.g. `http://localhost:3000` |
| `SESSION_SECRET` | 32+ chars. `openssl rand -base64 48` |
| `ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD` | Only read by the seed, first run only. 10+ chars. Admin must change it on first login |
| `BUSINESS_TIMEZONE` / `NEXT_PUBLIC_BUSINESS_TIMEZONE` | Optional, default `Asia/Manila`. If you change it, set **both** to the same value (server day boundaries and the browser's Today/Yesterday shortcuts) |

Never commit `.env`.

## 4. Create the database tables
```bash
npx prisma migrate dev --name init   # creates prisma/migrations/… (commit these) and applies them
npm run db:seed
```
For production use `npx prisma migrate deploy`. (`npx prisma db push` also works for a quick start, but without migration history.)

The seed is safe to re-run: it creates the Admin (only if missing), the shared Staff identity, the two products with starter price buttons, and default settings. It never resets the Admin password or overwrites data.

## 5. Run
```bash
npm run dev          # http://localhost:3000
npm run typecheck
npm test             # unit tests (date ranges, financial definitions, validation, xlsx)
RUN_DB_TESTS=1 npm test   # + database integration tests (use a throwaway DB — they write rows)
npm run test:e2e     # Playwright browser tests (needs a seeded DB; see e2e/section25.spec.ts)
```

## 6. Deploy to Vercel
1. Push to GitHub, import in Vercel.
2. Add the environment variables above (Production + Preview).
3. Build command: `prisma migrate deploy && next build` (so migrations apply on deploy).
4. Run the seed once from your machine against the production `DATABASE_URL`/`DIRECT_URL`: `npm run db:seed`.

## Business definitions (dashboard, staff summary and reports all share `services/analytics.ts`)
* **Total Sales** – COMPLETED sales created in the period: items + delivery fee. Voided sales are excluded.
* **Credit Sales** – the *unpaid* part of a sale, charged to a customer account. (A ₱260 sale with ₱100 paid = ₱160 credit, ₱100 cash.)
* **Cash Collections** – every active payment received in the period, including payments on old utang. Debt payments are shown separately and are **never** counted as sales.
* **Outstanding Debt** – sum of the customer ledger (charges − payments ± adjustments ± reversals).
* **Expenses** – active (non-voided) expenses. **Net Cash Flow** = Collections − Expenses. **Operating Result** = Total Sales − Expenses (accrual basis).
* Dates use the business timezone (Asia/Manila by default); "today" is the Manila day, weeks start Monday.
* Delivery fees are part of the sale total (and so of Total Sales); product charts use item amounts only.

## How the money is protected
* Prices/totals are recomputed on the server from the database; the browser's numbers are never trusted.
* Sale items snapshot product name, package, unit price, quantity and line total. Changing a price affects future sales only.
* Every sale carries a client idempotency key (retries after a slow connection return the same sale). Related writes run in one DB transaction; per-customer row locks serialise concurrent debt payments; delivery completion atomically claims the delivery so it can create **only one** sale.
* Nothing financial is deleted. Sales, debt payments and expenses are **voided** with a reason; payments, credit charges and stock are reversed by new ledger/movement entries and written to `AuditLog`.
* Voiding a sale that has later debt payments applied is refused until those payments are voided.
* Money is `Decimal(12,2)` in PostgreSQL and `Prisma.Decimal` in services. (The dashboard converts to JS numbers only for charts.)

## Security notes (read this)
* **Staff access is passwordless on purpose.** Anyone who can reach the site can open the Staff screens and use them. All staff actions are recorded under one shared "Staff" identity — there is no per-person staff verification. If that matters to you (for example, public internet exposure), restrict who can reach the URL at the network/hosting level or add a real identification step later.
* Admin endpoints each call `requireAdmin()` on the server; the Staff identity has no password hash and cannot log in. Admin cookies are HttpOnly, SameSite=Lax, Secure in production, 8-hour sessions, tokens stored as HMAC hashes. Login is rate-limited (5 failures / 15 min per IP+username). Changing the password signs out all other sessions. State-changing endpoints reject cross-site `Origin`s.
* Staff **can** record sales, register customers, receive debt payments, run deliveries and add expenses. Staff **cannot** edit prices/products/customers, void anything, adjust debt, view reports, or see audit logs.

## Known limits / design choices
* One shared Staff identity, so "Assign to Staff" means "show in the Staff delivery queue".
* Debt adjustments are ledger-level (they change the balance, not individual sale balances). Debt payments are applied oldest-credit-first.
* Customer prepayments/overpayments are not supported: a payment may not exceed the outstanding balance.
* Stock is only tracked for products where you turn it on, and a price button only deducts stock if you fill in "Stock used per unit". Retail packs never guess a sack conversion.
* Reports run in the app (not SQL) and are intended for small/medium data volumes.
* `next/font/google` downloads Inter at build time (works on Vercel; needs internet locally).

## Acceptance checks (A–J)
Everything for tests A–J is implemented end to end; run them by hand after setup:
A quick cash sale · B add a Tube Ice ₱35 button (Products & Pricing) · C credit sale for a customer · D partial payment (Customers/Utang → Receive payment) · E tap a phone number (`tel:` link) · F schedule → assign → Staff delivers (one sale only) · G staff expense appears in Admin → Expenses · H create sales across dates and compare dashboard periods · I turn on stock tracking, set "stock used per unit", receive stock and sell · J open `/admin/dashboard` logged out (redirects) and call an admin API without a session (401).

## Project layout
```
app/            pages + app/api route handlers (thin)
services/       business logic (sales, payments, debts, deliveries, expenses, inventory, reports, analytics)
lib/            auth, validation (Zod), date/timezone, money, formatting, audit
components/     UI (layout, pos, customers, deliveries, ui)
prisma/         schema.prisma, seed.ts
tests/          unit tests
```


## Section 25 update — what changed and how it works

**Delivery orders, payments and cancellation**
* Staff *and* Admin use one delivery board: search (name, number, address, order no. `DL-…`), a date picker, tabs (All, Pending, Out for Delivery, Delivered, Unpaid, Partially Paid, Paid, GCash, Cancelled) with counts, and totals for the selected tab/date (orders, delivered, unpaid, partially-paid balance, paid, GCash collected).
* **Delivery status and payment status are independent.** Payment status is *derived from recorded payments* (never stored separately, so it cannot drift): Unpaid / Partially paid / Paid. The quick actions — Paid — Cash, Paid — GCash, Partially paid, Unpaid / collect later — either create real payment records (amount, method, timestamp, optional GCash reference/note) or record nothing. "Unpaid" never changes a balance.
* **When does an order become a sale?** On the first money recorded against it *or* when it is delivered, whichever comes first (one sale per order, enforced by an atomic claim). Whatever is unpaid at that moment is charged to the customer's account as credit; later payments are applied to that order's sale as debt payments (never new sales). An undelivered, unpaid order is not a sale and is not collectible debt.
* **Mark as delivered** asks for confirmation, stores the delivered timestamp and the acting identity, and does *not* mark anything paid unless Cash/GCash was entered in the same dialog.
* **Cancel order** (customer cancelled) needs a reason; stores status, reason, timestamp, who. If the order already has a sale/payments they are reversed through the controlled void process (payments voided, credit charge reversed, stock restored, audit entries linked) — the amount refunded to the customer is handled outside the app. Delivered orders cannot be cancelled with this button; Admin uses **Reverse (Admin)**.
* Payment status values are `UNPAID`, `PARTIAL`, `PAID` (the spec suggested `PARTIALLY_PAID`; labels in the UI read "Partially paid").

**Payment overview** (Admin → Payments & Collections, Staff → Utang / Pay): unpaid, partially paid and paid orders/credit sales with customer, phone, reference, original amount, paid, balance, methods, last payment date; totals for unpaid, part-paid balance, paid, GCash collected, cash collected and total outstanding debt. *GCash collected* (confirmed payment records in the period) is shown separately from the *value of orders paid by GCash*.

**POS:** Tube Ice is listed first (seed gives it `sortOrder` 1; the order comes from the database). **Custom price**: pick product, price, quantity → added to the cart without touching the price buttons. The server rejects zero/negative/malformed values and anything above *Settings → highest custom price* (default ₱5,000); Admin can switch Staff custom pricing off. Sale items store `isCustomPrice`, unit price and product/package snapshots; custom lines never consume stock or count as sacks.

**Daily Sales Calendar** (Admin → Daily Sales Calendar; Staff → More → Daily Summary): Today / Yesterday / Previous day / Next day / date picker. Admin sees totals (sales, cash, GCash & digital, credit, debt payments, expenses, net cash flow, Tube/Crushed Ice quantity + amount, delivery counts), an hourly chart and the day's sales, payments, deliveries and expenses. Staff see the same day's records but can look back only 60 days (`STAFF_HISTORY_DAYS`). Day boundaries are computed on the server in the business timezone. The dashboard period picker also has Yesterday and a single-day picker.

**Excel / CSV export:** `GET /api/reports/<type>?format=xlsx|csv` (Admin only, server-generated with `exceljs`). Exports use the selected period/filters and return *all* matching rows (there is no "export current page" option). Sheets have a title, period, generated timestamp, numeric ₱ cells, text-formatted phone numbers/references and a formula-injection guard. Types include daily/period transactions, customer directory, customer transaction history, outstanding/unpaid accounts, debt ledger, debt payments, cash & GCash payments, deliveries, expenses, product/staff/sack summaries and inventory stock/movements.

**Mobile UI:** Admin bottom bar = Dashboard, Sales, Deliveries, Customers (Customers/Debts tabs), More (drawer with everything else). Staff bottom bar = POS, Deliveries, Customers, Utang / Pay, More (Transactions, Expenses, Daily Summary). Wide tables become labelled cards below 768 px (`CardTable` copies header text into each cell, so the balance and status come first); delivery, payment-overview and customer lists are cards by design. The POS Confirm button is sticky on phones.

**Staff identity:** payments and deliveries are still recorded under the single shared "Staff" user (there is deliberately no per-person staff login), so "Staff identity/session label" in records means that shared identity.

### Tests for Section 25 (written, **not yet executed**)
* `tests/section25.unit.test.ts` — Tube-first order, custom-price validation shape, daily boundaries, xlsx contents and formula guard.
* `tests/section25.integration.test.ts` — needs a database (`RUN_DB_TESTS=1`): delivered-but-unpaid, Cash/GCash paid, partial payments (exact balances), GCash counts confirmed records only, duplicate submission, cancellation with/without a sale (reversal + audit), delivered orders can't be cancelled normally, no double sale, server-side custom-price rejection, daily totals reconcile, Staff history limit.
* `e2e/section25.spec.ts` — Playwright (desktop + phone): Tube-first POS, custom price UI, delivery filters, no sideways scrolling, bottom navigation + More menus for Staff and Admin, yesterday selection, xlsx download, Staff blocked from Admin data/exports. Admin tests need `E2E_ADMIN_PASSWORD`.
