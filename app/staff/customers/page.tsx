'use client';
import { useState } from 'react';
import { Phone, Plus } from 'lucide-react';
import { useFetch, type Json } from '@/lib/client/api';
import { formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { CustomerDetail } from '@/components/customers/CustomerDetail';
import { EmptyState, ErrorNote, TableSkeleton } from '@/components/ui/common';

export default function StaffCustomers() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useFetch<Json>(`/api/customers?q=${encodeURIComponent(q)}&take=50`);
  return (
    <div>
      <div className="d-flex gap-2 mb-3">
        <input className="form-control form-control-lg" placeholder="Search name, number, or location…" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New</button>
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No customers found" /> : (
          <ul className="list-group list-group-flush">
            {data?.rows.map((c: Json) => (
              <li key={c.id} className="list-group-item d-flex align-items-center gap-2 py-3">
                <button className="btn btn-link text-start text-decoration-none p-0 flex-grow-1 text-body" onClick={() => setOpen(c.id)}>
                  <div className="fw-semibold">{c.name}</div>
                  <div className="small text-muted-2">{c.address}</div>
                  {Number(c.outstandingBalance) > 0 && <span className="pill bad money">Owes {formatPeso(c.outstandingBalance)}</span>}
                </button>
                <a className="btn btn-outline-primary" href={telHref(c.phone)} aria-label={`Call ${c.name}`}><Phone size={16} aria-hidden /> {c.phone}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && <CustomerDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {creating && <CustomerForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </div>
  );
}
