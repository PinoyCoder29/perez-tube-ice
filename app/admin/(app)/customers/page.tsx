'use client';
import { useState } from 'react';
import { Phone, Plus, Pencil } from 'lucide-react';
import { useFetch, type Json } from '@/lib/client/api';
import { formatDate, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { CustomerDetail } from '@/components/customers/CustomerDetail';
import { CardTable, CustomersDebtsTabs, EmptyState, ErrorNote, ExportButtons, PageHeader, Pager, StatusBadge, TableSkeleton } from '@/components/ui/common';
import { PAYMENT_STATUS_LABELS } from '@/lib/constants';

export default function AdminCustomers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ initial?: Json } | null>(null);
  const { data, loading, error, reload } = useFetch<Json>(`/api/customers?q=${encodeURIComponent(q)}&inactive=1&take=25&skip=${(page - 1) * 25}`);
  return (
    <div>
      <PageHeader title="Customers" actions={<><ExportButtons type="customers" params={{ period: 'month' }} label="Directory" /><button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} aria-hidden /> Add customer</button></>} />
      <CustomersDebtsTabs active="customers" />
      <input className="form-control mb-3" style={{ maxWidth: 380 }} placeholder="Search name, number, address…" aria-label="Search customers" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {data && <div className="small text-muted-2 mb-2" aria-live="polite">{data.total} customer{data.total === 1 ? '' : 's'}{q ? ' match your search' : ' in total'}</div>}
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No customers found" /> : (
          <CardTable><table className="table mb-0 align-middle">
            <thead><tr><th>Name</th><th className="text-end">Balance</th><th>Payment</th><th>Contact</th><th>Address</th><th className="text-end">Total purchases</th><th>Last transaction</th><th className="text-end">Completed deliveries</th><th>Last delivery</th><th /></tr></thead>
            <tbody>{data?.rows.map((c: Json) => (
              <tr key={c.id}>
                <td><button className="btn btn-link p-0 fw-semibold text-start" onClick={() => setOpen(c.id)}>{c.name}</button> {!c.active && <StatusBadge status="CANCELLED" label="Inactive" />}</td>
                <td className={`text-end money ${Number(c.outstandingBalance) > 0 ? 'text-danger fw-semibold' : ''}`}>{formatPeso(c.outstandingBalance)}</td>
                <td>{c.accountStatus ? <StatusBadge status={c.accountStatus} label={PAYMENT_STATUS_LABELS[c.accountStatus]} /> : <span className="text-muted-2">No credit</span>}</td>
                <td><a href={telHref(c.phone)}><Phone size={13} aria-hidden /> {c.phone}</a></td>
                <td>{c.address}</td><td className="text-end money">{formatPeso(c.totalPurchases)}</td>
                <td>{formatDate(c.lastTransactionAt)}</td>
                <td className="text-end">{c.completedDeliveries}</td><td>{c.lastDeliveryAt ? formatDate(c.lastDeliveryAt) : 'No deliveries yet'}</td>
                <td><button className="btn btn-sm btn-outline-primary" onClick={() => setForm({ initial: c })}><Pencil size={14} aria-hidden /> Edit</button></td>
              </tr>))}</tbody></table></CardTable>
        )}
        {data && <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />}
      </div>
      {open && <CustomerDetail admin id={open} onClose={() => setOpen(null)} onChanged={reload} />}
      {form && <CustomerForm admin initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </div>
  );
}
