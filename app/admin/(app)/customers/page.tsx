'use client';
import { useState } from 'react';
import { Phone, Plus, Truck, Pencil } from 'lucide-react';
import { useFetch, type Json } from '@/lib/client/api';
import { formatDate, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { CustomerDetail } from '@/components/customers/CustomerDetail';
import { EmptyState, ErrorNote, PageHeader, Pager, StatusBadge, TableSkeleton } from '@/components/ui/common';

export default function AdminCustomers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ initial?: Json } | null>(null);
  const { data, loading, error, reload } = useFetch<Json>(`/api/customers?q=${encodeURIComponent(q)}&inactive=1&take=25&skip=${(page - 1) * 25}`);
  return (
    <div>
      <PageHeader title="Customers" actions={<button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} aria-hidden /> Add customer</button>} />
      <input className="form-control mb-3" style={{ maxWidth: 380 }} placeholder="Search name, number, address…" aria-label="Search customers" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No customers found" /> : (
          <div className="table-responsive"><table className="table mb-0 align-middle">
            <thead><tr><th>Name</th><th>Contact</th><th>Address</th><th className="text-end">Total purchases</th><th className="text-end">Balance</th><th>Last transaction</th><th /></tr></thead>
            <tbody>{data?.rows.map((c: Json) => (
              <tr key={c.id}>
                <td><button className="btn btn-link p-0 fw-semibold text-start" onClick={() => setOpen(c.id)}>{c.name}</button> {!c.active && <StatusBadge status="CANCELLED" label="Inactive" />}</td>
                <td><a href={telHref(c.phone)}><Phone size={13} aria-hidden /> {c.phone}</a></td>
                <td>{c.address}</td><td className="text-end money">{formatPeso(c.totalPurchases)}</td>
                <td className={`text-end money ${Number(c.outstandingBalance) > 0 ? 'text-danger fw-semibold' : ''}`}>{formatPeso(c.outstandingBalance)}</td>
                <td>{formatDate(c.lastTransactionAt)}</td>
                <td><button className="btn btn-sm btn-outline-primary" onClick={() => setForm({ initial: c })}><Pencil size={14} aria-hidden /> Edit</button></td>
              </tr>))}</tbody></table></div>
        )}
        {data && <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />}
      </div>
      {open && <CustomerDetail id={open} onClose={() => setOpen(null)} onChanged={reload} extraActions={(c) => <a className="btn btn-outline-primary" href={`/admin/deliveries?customerId=${c.id}`}><Truck size={14} aria-hidden /> Schedule delivery</a>} />}
      {form && <CustomerForm admin initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
