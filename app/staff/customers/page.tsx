'use client';
import { useState } from 'react';
import { Phone } from 'lucide-react';
import { useFetch, type Json } from '@/lib/client/api';
import { formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { CustomerShortcut } from '@/components/customers/CustomerShortcut';
import { EmptyState, ErrorNote, StatusBadge, TableSkeleton } from '@/components/ui/common';
import { PAYMENT_STATUS_LABELS } from '@/lib/constants';

// Staff can search and open customers, but cannot add or edit them: only Admin creates permanent customer records.
export default function StaffCustomers() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Json | null>(null);
  const { data, loading, error, reload } = useFetch<Json>(`/api/customers?q=${encodeURIComponent(q)}&take=50`);
  return (
    <div>
      <input className="form-control form-control-lg mb-2" placeholder="Search name, number, or location…" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
      {data && <div className="small text-muted-2 mb-3">{data.total} customer{data.total === 1 ? '' : 's'}{q ? ' found' : ''}</div>}
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? (
          <EmptyState title="Customer not found" text="Only the Admin can add new customers. Tell the Admin to add this customer first — once saved, they will appear here and in Deliveries." />
        ) : (
          <ul className="list-group list-group-flush">
            {data?.rows.map((c: Json) => (
              <li key={c.id} className="list-group-item d-flex align-items-center gap-2 py-3 flex-wrap">
                <button className="btn btn-link text-start text-decoration-none p-0 flex-grow-1 text-body" onClick={() => setOpen(c)} style={{ minWidth: 200 }}>
                  <div className="fw-semibold">{c.name}</div>
                  <div className="small text-muted-2 wrap-any">{c.address}</div>
                  {c.accountStatus && <span className="d-flex gap-2 align-items-center mt-1 flex-wrap"><StatusBadge status={c.accountStatus} label={PAYMENT_STATUS_LABELS[c.accountStatus]} />{Number(c.outstandingBalance) > 0 && <strong className="money text-danger">Owes {formatPeso(c.outstandingBalance)}</strong>}</span>}
                </button>
                <a className="btn btn-outline-primary" href={telHref(c.phone)} aria-label={`Call ${c.name}`}><Phone size={16} aria-hidden /> {c.phone}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && <CustomerShortcut customer={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
