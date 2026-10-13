# Perez Ice Business Management System

Ice sales and delivery management for a small Philippine business. Two entry points:

* **Admin** – password login. Dashboard, products & prices, customers, utang (credit) ledger, payments, deliveries, expenses, inventory, reports (CSV), audit/staff activity, settings.
* **Staff** – opens straight into the POS, **no password** (by design). Sales (cash / GCash / utang / split), customers with tap-to-call, today's transactions, debts and payment collection, delivery queue, expenses, today's summary.

Stack: Next.js 14 (App Router) · TypeScript (strict) · Bootstrap 5 · Recharts · Lucide · Prisma · PostgreSQL (Neon) · Zod · bcryptjs.

> **Status:** this code was generated without being able to run `npm install`, `next build` or a database in the build environment. The date/period and financial-definition logic was checked in isolation (see `tests/logic.test.ts`), but the project as a whole has **not been compiled or run**. Treat the first `npm run typecheck` / `npm run build` as part of setup and expect to fix a few small type or typo errors. Prisma migration files are also not included yet — see step 4.

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
| `BUSINESS_TIMEZONE` | Optional, default `Asia/Manila` |

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
npm test             # unit tests for date ranges + financial definitions
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
