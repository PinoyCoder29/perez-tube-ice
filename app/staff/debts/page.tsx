'use client';
import { useState } from 'react';
import { Phone } from 'lucide-react';
import { useFetch, qs, type Json } from '@/lib/client/api';
import { formatDate, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { CustomerDetail } from '@/components/customers/CustomerDetail';
import { EmptyState, ErrorNote, TableSkeleton } from '@/components/ui/common';
import { PaymentOverview } from '@/components/customers/PaymentOverview';

const FILTERS = [['', 'All outstanding'], ['today', "Today's credit"], ['week', "This week's credit"], ['month', "This month's credit"]];

function Debts() {
  const [q, setQ] = useState('');
  const [f, setF] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const { data, loading, error, reload } = useFetch<Json>(`/api/debts${qs({ q, period: f })}`);
  return (
    <div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        <input className="form-control" style={{ maxWidth: 320 }} placeholder="Search customer…" aria-label="Search debts" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="btn-group">{FILTERS.map(([k, l]) => <button key={k} className={`btn btn-sm ${f === k ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setF(k)}>{l}</button>)}</div>
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No outstanding debts" /> : (
          <ul className="list-group list-group-flush">
            {data?.rows.map((r: Json) => (
              <li className="list-group-item d-flex flex-wrap align-items-center gap-2 py-3" key={r.customerId}>
                <div className="flex-grow-1">
                  <div className="fw-semibold">{r.name}</div>
                  <div className="small text-muted-2">Last credit: {r.lastPurchase ? `${formatDate(r.lastPurchase)} (${formatPeso(r.lastPurchaseAmount)})` : '—'}</div>
                </div>
                <div className="fw-bold money text-danger">{formatPeso(r.balance)}</div>
                <a className="btn btn-outline-primary btn-sm" href={telHref(r.phone)}><Phone size={14} aria-hidden /> {r.phone}</a>
                <button className="btn btn-primary btn-sm" onClick={() => setOpen(r.customerId)}>Details</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && <CustomerDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}

export default function StaffDebts() {
  const [tab, setTab] = useState<'debts' | 'overview'>('debts');
  const [cust, setCust] = useState<string | null>(null);
  return (
    <div>
      <h1 className="h5 fw-bold mb-3">Utang / Payments</h1>
      <div className="btn-group mb-3" role="tablist"><button role="tab" aria-selected={tab === 'debts'} className={`btn btn-sm ${tab === 'debts' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab('debts')}>Customer debts</button><button role="tab" aria-selected={tab === 'overview'} className={`btn btn-sm ${tab === 'overview' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab('overview')}>Payment overview</button></div>
      {tab === 'debts' ? <Debts /> : <PaymentOverview onOpenCustomer={setCust} />}
      {cust && <CustomerDetail id={cust} onClose={() => setCust(null)} />}
    </div>
  );
}
