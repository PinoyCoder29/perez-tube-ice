'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { businessDate } from '@/lib/formatting';
import { Inbox } from 'lucide-react';

export function Spinner({ small }: { small?: boolean }) {
  return <span className={`spinner-border ${small ? 'spinner-border-sm' : ''}`} role="status" aria-label="Loading" />;
}

export function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string | number }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-3 d-grid gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={22} />
      ))}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="text-center text-muted-2 py-5 px-3">
      <Inbox size={36} className="mb-2" aria-hidden />
      <div className="fw-semibold text-body">{title}</div>
      {text && <div className="small">{text}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <div className="alert alert-danger py-2 mb-3" role="alert">{message}</div> : null;
}

const PILL: Record<string, string> = {
  PAID: 'ok', COMPLETED: 'ok', DELIVERED: 'ok', ACTIVE: 'ok', OK: 'ok',
  PARTIAL: 'warn', PENDING: 'warn', ASSIGNED: 'info', OUT_FOR_DELIVERY: 'info', UNPAID: 'bad',
  FAILED: 'bad', VOIDED: 'mute', CANCELLED: 'mute', LOW: 'bad',
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`pill ${PILL[status] ?? 'mute'}`}>{label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="text-muted-2 small">{subtitle}</div>}
      </div>
      {actions && <div className="d-flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export interface PeriodValue {
  period: 'today' | 'week' | 'month' | 'year' | 'custom';
  from: string;
  to: string;
}
const PERIODS: [PeriodValue['period'], string][] = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['custom', 'Custom']];

export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const yesterday = businessDate(-1);
  const isDay = value.period === 'custom' && value.from === value.to && !!value.from;
  const setDay = (d: string) => onChange({ period: 'custom', from: d, to: d });
  return (
    <div className="d-flex flex-wrap gap-2 align-items-center">
      <div className="btn-group flex-wrap" role="group" aria-label="Period">
        <button type="button" className={`btn btn-sm ${value.period === 'today' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => onChange({ ...value, period: 'today' })}>Today</button>
        <button type="button" className={`btn btn-sm ${isDay && value.from === yesterday ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setDay(yesterday)}>Yesterday</button>
        {PERIODS.filter(([k]) => k !== 'today').map(([k, l]) => (
          <button key={k} type="button" className={`btn btn-sm ${value.period === k && !(k === 'custom' && isDay && value.from === yesterday) ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => onChange({ ...value, period: k })}>
            {l}
          </button>
        ))}
      </div>
      <input type="date" aria-label="Choose a single day" className="form-control form-control-sm" style={{ width: 150 }} title="Choose date" value={isDay ? value.from : ''} max={undefined} onChange={(e) => e.target.value && setDay(e.target.value)} />
      {value.period === 'custom' && !isDay && (
        <div className="d-flex gap-2 align-items-center">
          <input type="date" aria-label="From date" className="form-control form-control-sm" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-muted-2">to</span>
          <input type="date" aria-label="To date" className="form-control form-control-sm" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}

export function usePeriod(initial: PeriodValue['period'] = 'today') {
  return useState<PeriodValue>({ period: initial, from: '', to: '' });
}

/** Query params for a period value; custom ranges without both dates fall back to nothing (caller should skip fetch). */
export function periodReady(p: PeriodValue) {
  return p.period !== 'custom' || (!!p.from && !!p.to);
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="d-flex justify-content-between align-items-center p-3 border-top">
      <span className="small text-muted-2">Page {page} of {pages} · {total} records</span>
      <div className="btn-group">
        <button className="btn btn-sm btn-outline-primary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn btn-sm btn-outline-primary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="d-block mb-3">
      <span className="form-label small fw-semibold mb-1 d-block">{label}</span>
      {children}
      {hint && <span className="form-text">{hint}</span>}
    </label>
  );
}

/** Single-day selector with Today / Yesterday / Previous day / Choose date. Dates are business-timezone YYYY-MM-DD. */
export function DayPicker({ value, onChange, minDate }: { value: string; onChange: (d: string) => void; minDate?: string }) {
  const shift = (n: number) => {
    const [y, m, d] = (value || businessDate(0)).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    onChange(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`);
  };
  const today = businessDate(0);
  const yest = businessDate(-1);
  return (
    <div className="d-flex flex-wrap gap-2 align-items-center">
      <div className="btn-group" role="group" aria-label="Day shortcuts">
        <button className={`btn btn-sm ${value === today ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => onChange(today)}>Today</button>
        <button className={`btn btn-sm ${value === yest ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => onChange(yest)}>Yesterday</button>
        <button className="btn btn-sm btn-outline-primary" onClick={() => shift(-1)}>‹ Previous day</button>
        <button className="btn btn-sm btn-outline-primary" onClick={() => shift(1)}>Next day ›</button>
      </div>
      <input type="date" aria-label="Choose date" className="form-control form-control-sm" style={{ width: 160 }} value={value} min={minDate} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </div>
  );
}

/** Wide table that turns into labelled cards on phones (labels are copied from the header cells). */
export function CardTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = ref.current?.querySelector('table');
    if (!t) return;
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent ?? '');
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => td.setAttribute('data-label', heads[i] ?? '')));
  });
  return <div ref={ref} className={`table-responsive table-cards ${className}`}>{children}</div>;
}

/** Excel + CSV downloads for an Admin report using the same filters as the screen (all matching rows, not just the visible page). */
export function ExportButtons({ type, params, label = 'Export' }: { type: string; params: Record<string, string | number | boolean | null | undefined>; label?: string }) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  const href = (f: string) => `/api/reports/${type}?${sp.toString()}${sp.toString() ? '&' : ''}format=${f}`;
  return (
    <div className="btn-group btn-group-sm">
      <a className="btn btn-primary" href={href('xlsx')}><Download size={14} aria-hidden /> {label} Excel</a>
      <a className="btn btn-outline-primary" href={href('csv')}>CSV</a>
    </div>
  );
}

export function CustomersDebtsTabs({ active }: { active: 'customers' | 'debts' }) {
  return (
    <div className="btn-group mb-3" role="tablist" aria-label="Customers and debts">
      <a role="tab" aria-selected={active === 'customers'} className={`btn btn-sm ${active === 'customers' ? 'btn-primary' : 'btn-outline-primary'}`} href="/admin/customers">Customers</a>
      <a role="tab" aria-selected={active === 'debts'} className={`btn btn-sm ${active === 'debts' ? 'btn-primary' : 'btn-outline-primary'}`} href="/admin/debts">Utang / Debts</a>
    </div>
  );
}
