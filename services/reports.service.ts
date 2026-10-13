import { prisma } from '@/lib/db/prisma';
import { HttpError } from '@/lib/errors';
import { num } from '@/lib/money';
import { formatQty } from '@/lib/formatting';
import { groupKey, resolveRange, type Group, type Period } from '@/lib/date';
import { PACKAGE_LABELS, PAYMENT_METHOD_LABELS, DELIVERY_STATUS_LABELS, MOVEMENT_LABELS } from '@/lib/constants';
import { REPORT_TYPES } from './reports.meta';
import { debtorTable } from './debts.service';
import { listInventory } from './inventory.service';

export interface Column {
  key: string;
  label: string;
  type?: 'money' | 'number' | 'text' | 'datetime';
}
export interface ReportResult {
  title: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
}
export interface ReportParams {
  period: Period;
  from?: string | null;
  to?: string | null;
  group: Group;
  status?: string | null;
}

export { REPORT_TYPES };

const money = (n: unknown) => Math.round(num(n as number) * 100) / 100;

export async function runReport(type: string, p: ReportParams): Promise<ReportResult> {
  const range = resolveRange(p.period, { from: p.from, to: p.to });
  const inRange = { gte: range.start, lt: range.end };

  switch (type) {
    case 'sales': {
      const sales = await prisma.sale.findMany({ where: { status: 'COMPLETED', createdAt: inRange }, select: { createdAt: true, totalAmount: true, amountPaid: true } });
      const charges = await prisma.ledgerEntry.findMany({ where: { type: 'CHARGE', createdAt: inRange, sale: { status: 'COMPLETED' } }, select: { createdAt: true, amount: true } });
      const m = new Map<string, { transactions: number; total: number; credit: number }>();
      const slot = (k: string) => m.get(k) ?? m.set(k, { transactions: 0, total: 0, credit: 0 }).get(k)!;
      for (const s of sales) {
        const x = slot(groupKey(s.createdAt, p.group));
        x.transactions++;
        x.total += num(s.totalAmount);
      }
      for (const c of charges) slot(groupKey(c.createdAt, p.group)).credit += num(c.amount);
      return {
        title: `Sales by ${p.group}`,
        columns: [
          { key: 'period', label: p.group === 'week' ? 'Week starting' : 'Period' },
          { key: 'transactions', label: 'Transactions', type: 'number' },
          { key: 'total', label: 'Total sales', type: 'money' },
          { key: 'credit', label: 'Credit sales', type: 'money' },
          { key: 'paid', label: 'Paid at sale', type: 'money' },
        ],
        rows: [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ period: k, transactions: v.transactions, total: money(v.total), credit: money(v.credit), paid: money(v.total - v.credit) })),
      };
    }
    case 'product-performance':
    case 'sack-sales': {
      const items = await prisma.saleItem.findMany({
        where: { sale: { status: 'COMPLETED', createdAt: inRange }, ...(type === 'sack-sales' ? { sacks: { gt: 0 } } : {}) },
        select: { saleId: true, productNameSnapshot: true, packageTypeSnapshot: true, labelSnapshot: true, quantity: true, lineTotal: true, sacks: true },
      });
      const m = new Map<string, { product: string; pkg: string; qty: number; sacks: number; amount: number; sales: Set<string> }>();
      for (const i of items) {
        const k = type === 'sack-sales' ? `${i.productNameSnapshot}|${i.packageTypeSnapshot}` : i.productNameSnapshot;
        const x = m.get(k) ?? { product: i.productNameSnapshot, pkg: PACKAGE_LABELS[i.packageTypeSnapshot], qty: 0, sacks: 0, amount: 0, sales: new Set<string>() };
        x.qty += i.quantity;
        x.sacks += num(i.sacks);
        x.amount += num(i.lineTotal);
        x.sales.add(i.saleId);
        m.set(k, x);
      }
      const sack = type === 'sack-sales';
      return {
        title: sack ? 'Sack sales' : 'Product performance',
        columns: [
          { key: 'product', label: 'Product' },
          ...(sack ? [{ key: 'package', label: 'Package' }] : []),
          { key: 'quantity', label: 'Units / packs sold', type: 'number' as const },
          { key: 'sacks', label: 'Sacks sold', type: 'number' as const },
          { key: 'transactions', label: 'Transactions', type: 'number' as const },
          { key: 'amount', label: 'Sales amount', type: 'money' as const },
        ],
        rows: [...m.values()].map((x) => ({ product: x.product, package: x.pkg, quantity: x.qty, sacks: x.sacks, transactions: x.sales.size, amount: money(x.amount) })),
      };
    }
    case 'staff-sales': {
      const sales = await prisma.sale.findMany({ where: { status: 'COMPLETED', createdAt: inRange }, select: { totalAmount: true, staff: { select: { name: true } } } });
      const m = new Map<string, { n: number; t: number }>();
      for (const s of sales) {
        const x = m.get(s.staff.name) ?? { n: 0, t: 0 };
        x.n++;
        x.t += num(s.totalAmount);
        m.set(s.staff.name, x);
      }
      return {
        title: 'Staff sales summary',
        columns: [{ key: 'staff', label: 'Recorded by' }, { key: 'transactions', label: 'Transactions', type: 'number' }, { key: 'total', label: 'Total sales', type: 'money' }],
        rows: [...m.entries()].map(([k, v]) => ({ staff: k, transactions: v.n, total: money(v.t) })),
      };
    }
    case 'collections': {
      const pays = await prisma.payment.findMany({ where: { status: 'ACTIVE', createdAt: inRange }, select: { amount: true, paymentMethod: true, paymentType: true } });
      const m = new Map<string, { method: string; type: string; n: number; t: number }>();
      for (const x of pays) {
        const k = `${x.paymentMethod}|${x.paymentType}`;
        const v = m.get(k) ?? { method: PAYMENT_METHOD_LABELS[x.paymentMethod], type: x.paymentType === 'DEBT_PAYMENT' ? 'Debt payment' : 'Sale payment', n: 0, t: 0 };
        v.n++;
        v.t += num(x.amount);
        m.set(k, v);
      }
      return {
        title: 'Collections',
        columns: [{ key: 'method', label: 'Method' }, { key: 'type', label: 'Type' }, { key: 'count', label: 'Payments', type: 'number' }, { key: 'amount', label: 'Amount', type: 'money' }],
        rows: [...m.values()].map((v) => ({ method: v.method, type: v.type, count: v.n, amount: money(v.t) })),
      };
    }
    case 'debt-payments': {
      const pays = await prisma.payment.findMany({
        where: { status: 'ACTIVE', paymentType: 'DEBT_PAYMENT', createdAt: inRange },
        include: { customer: { select: { name: true } }, receivedBy: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        title: 'Debt payments received',
        columns: [{ key: 'date', label: 'Date', type: 'datetime' }, { key: 'ref', label: 'Reference' }, { key: 'customer', label: 'Customer' }, { key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'by', label: 'Received by' }],
        rows: pays.map((x) => ({ date: x.createdAt.toISOString(), ref: x.paymentReference, customer: x.customer?.name ?? '', method: PAYMENT_METHOD_LABELS[x.paymentMethod], amount: money(x.amount), by: x.receivedBy.name })),
      };
    }
    case 'unpaid-credit': {
      const sales = await prisma.sale.findMany({
        where: { status: 'COMPLETED', paymentStatus: { not: 'PAID' }, createdAt: inRange },
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        title: 'Unpaid credit sales',
        columns: [{ key: 'date', label: 'Date', type: 'datetime' }, { key: 'txn', label: 'Transaction' }, { key: 'customer', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' }, { key: 'due', label: 'Still unpaid', type: 'money' }],
        rows: sales.map((s) => ({ date: s.createdAt.toISOString(), txn: s.transactionNumber, customer: s.customer?.name ?? '', phone: s.customer?.phone ?? '', total: money(s.totalAmount), paid: money(s.amountPaid), due: money(s.totalAmount.minus(s.amountPaid)) })),
      };
    }
    case 'outstanding': {
      const rows = await debtorTable({ outstandingOnly: true });
      return {
        title: 'Outstanding balances (as of now)',
        columns: [{ key: 'customer', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'charges', label: 'Total credit', type: 'money' }, { key: 'payments', label: 'Payments', type: 'money' }, { key: 'balance', label: 'Balance', type: 'money' }, { key: 'lastPurchase', label: 'Last purchase', type: 'datetime' }, { key: 'lastPayment', label: 'Last payment', type: 'datetime' }],
        rows: rows.map((r) => ({ customer: r.name, phone: r.phone, charges: money(r.totalCharges), payments: money(r.totalPayments), balance: money(r.balance), lastPurchase: r.lastPurchase?.toISOString() ?? null, lastPayment: r.lastPayment?.toISOString() ?? null })),
      };
    }
    case 'expenses': {
      const ex = await prisma.expense.findMany({ where: { status: 'ACTIVE', incurredAt: inRange }, select: { incurredAt: true, amount: true } });
      const m = new Map<string, { n: number; t: number }>();
      for (const e of ex) {
        const k = groupKey(e.incurredAt, p.group);
        const v = m.get(k) ?? { n: 0, t: 0 };
        v.n++;
        v.t += num(e.amount);
        m.set(k, v);
      }
      return {
        title: `Expenses by ${p.group}`,
        columns: [{ key: 'period', label: 'Period' }, { key: 'count', label: 'Entries', type: 'number' }, { key: 'amount', label: 'Total expenses', type: 'money' }],
        rows: [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ period: k, count: v.n, amount: money(v.t) })),
      };
    }
    case 'expenses-category':
    case 'expenses-staff': {
      const ex = await prisma.expense.findMany({ where: { status: 'ACTIVE', incurredAt: inRange }, select: { category: true, amount: true, staff: { select: { name: true } } } });
      const m = new Map<string, { n: number; t: number }>();
      for (const e of ex) {
        const k = type === 'expenses-category' ? e.category : e.staff.name;
        const v = m.get(k) ?? { n: 0, t: 0 };
        v.n++;
        v.t += num(e.amount);
        m.set(k, v);
      }
      return {
        title: type === 'expenses-category' ? 'Expenses by category' : 'Expenses by staff member',
        columns: [{ key: 'name', label: type === 'expenses-category' ? 'Category' : 'Recorded by' }, { key: 'count', label: 'Entries', type: 'number' }, { key: 'amount', label: 'Total', type: 'money' }],
        rows: [...m.entries()].sort(([, a], [, b]) => b.t - a.t).map(([k, v]) => ({ name: k, count: v.n, amount: money(v.t) })),
      };
    }
    case 'deliveries':
    case 'deliveries-customer': {
      const where = { scheduledAt: inRange, ...(p.status && p.status in DELIVERY_STATUS_LABELS ? { status: p.status as never } : {}) };
      const ds = await prisma.delivery.findMany({ where, include: { customer: { select: { name: true } }, items: true, sale: { select: { totalAmount: true, amountPaid: true } } }, orderBy: { scheduledAt: 'asc' } });
      if (type === 'deliveries-customer') {
        const m = new Map<string, { n: number; done: number; collected: number }>();
        for (const d of ds) {
          const v = m.get(d.customer.name) ?? { n: 0, done: 0, collected: 0 };
          v.n++;
          if (d.status === 'DELIVERED') v.done++;
          v.collected += num(d.sale?.amountPaid);
          m.set(d.customer.name, v);
        }
        return {
          title: 'Deliveries by customer',
          columns: [{ key: 'customer', label: 'Customer' }, { key: 'total', label: 'Deliveries', type: 'number' }, { key: 'delivered', label: 'Delivered', type: 'number' }, { key: 'collected', label: 'Amount collected', type: 'money' }],
          rows: [...m.entries()].map(([k, v]) => ({ customer: k, total: v.n, delivered: v.done, collected: money(v.collected) })),
        };
      }
      return {
        title: 'Deliveries',
        columns: [{ key: 'date', label: 'Scheduled', type: 'datetime' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'items', label: 'Items' }, { key: 'fee', label: 'Delivery fee', type: 'money' }, { key: 'collected', label: 'Amount collected', type: 'money' }],
        rows: ds.map((d) => ({ date: d.scheduledAt.toISOString(), customer: d.customer.name, status: DELIVERY_STATUS_LABELS[d.status], items: d.items.map((i) => `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`).join('; '), fee: money(d.deliveryFee), collected: money(d.sale?.amountPaid) })),
      };
    }
    case 'inventory-stock':
    case 'low-stock': {
      let inv = await listInventory();
      if (type === 'low-stock') inv = inv.filter((i) => i.low);
      return {
        title: type === 'low-stock' ? 'Low-stock products' : 'Current stock',
        columns: [{ key: 'product', label: 'Product' }, { key: 'stock', label: 'Current stock' }, { key: 'threshold', label: 'Low-stock threshold' }, { key: 'status', label: 'Status' }],
        rows: inv.map((i) => ({
          product: i.name,
          stock: i.configured ? `${formatQty(num(i.currentStock))} ${i.stockUnit}` : 'Not configured',
          threshold: i.lowStockThreshold ? formatQty(num(i.lowStockThreshold)) : '',
          status: !i.configured ? 'Not configured' : i.low ? 'LOW' : 'OK',
        })),
      };
    }
    case 'inventory-movements': {
      const mv = await prisma.inventoryMovement.findMany({ where: { createdAt: inRange }, include: { product: { select: { name: true } }, recordedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 2000 });
      return {
        title: 'Inventory movements',
        columns: [{ key: 'date', label: 'Date', type: 'datetime' }, { key: 'product', label: 'Product' }, { key: 'type', label: 'Type' }, { key: 'quantity', label: 'Quantity', type: 'number' }, { key: 'reason', label: 'Reason' }, { key: 'by', label: 'Recorded by' }],
        rows: mv.map((m) => ({ date: m.createdAt.toISOString(), product: m.product.name, type: MOVEMENT_LABELS[m.movementType], quantity: num(m.quantity), reason: m.reason ?? '', by: m.recordedBy.name })),
      };
    }
    default:
      throw new HttpError(404, 'Unknown report type.');
  }
}

/** CSV with a UTF-8 BOM (Excel friendly). Cells starting with = + - @ are neutralised against formula injection. */
export function toCsv(r: ReportResult): string {
  const esc = (v: string | number | null) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [r.columns.map((c) => esc(c.label)).join(',')];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(row[c.key] ?? null)).join(','));
  return '\uFEFF' + lines.join('\r\n');
}
