'use client';
import { useState } from 'react';
import { api, useFetch, qs, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { EmptyState, ErrorNote, PageHeader, Pager, PeriodPicker, StatusBadge, TableSkeleton, periodReady, usePeriod } from '@/components/ui/common';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { useAsk, useToast } from '@/components/ui/providers';

export default function AdminSales() {
  const [p, setP] = usePeriod('today');
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ productId: '', staffId: '', method: '', paymentStatus: '', status: '', q: '' });
  const products = useFetch<Json[]>('/api/products?all=1');
  const users = useFetch<Json[]>('/api/users');
  const { data, loading, error, reload } = useFetch<Json>(periodReady(p) ? `/api/sales${qs({ ...p, ...f, page, pageSize: 25 })}` : null);
  const ask = useAsk();
  const toast = useToast();
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };

  async function voidSale(s: Json) {
    const r = await ask({ title: `Void ${s.transactionNumber}?`, message: 'The sale is kept for audit but removed from totals; payments, credit and stock are reversed.', reason: true, danger: true, confirmText: 'Void sale' });
    if (!r.ok) return;
    try { await api(`/api/sales/${s.id}/void`, { body: { reason: r.reason } }); toast('Sale voided'); reload(); } catch (e) { toast((e as Error).message, 'danger'); }
  }

  return (
    <div>
      <PageHeader title="POS / Sales History" actions={<PeriodPicker value={p} onChange={(v) => { setP(v); setPage(1); }} />} />
      <div className="row g-2 mb-3">
        <div className="col-6 col-md-3"><input className="form-control" placeholder="Search txn / customer" aria-label="Search" value={f.q} onChange={(e) => set('q', e.target.value)} /></div>
        <div className="col-6 col-md-2"><select className="form-select" aria-label="Product" value={f.productId} onChange={(e) => set('productId', e.target.value)}><option value="">All products</option>{products.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="col-6 col-md-2"><select className="form-select" aria-label="Staff" value={f.staffId} onChange={(e) => set('staffId', e.target.value)}><option value="">All staff</option>{users.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="col-6 col-md-2"><select className="form-select" aria-label="Payment method" value={f.method} onChange={(e) => set('method', e.target.value)}><option value="">Any method</option>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="col-6 col-md-1"><select className="form-select" aria-label="Payment status" value={f.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)}><option value="">Paid?</option><option value="PAID">Paid</option><option value="PARTIAL">Partial</option><option value="UNPAID">Unpaid</option></select></div>
        <div className="col-6 col-md-2"><select className="form-select" aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="VOIDED">Voided</option></select></div>
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No transactions match" /> : (
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead><tr><th>Date</th><th>Transaction</th><th>Staff</th><th>Customer</th><th>Items</th><th className="text-end">Total</th><th className="text-end">Paid</th><th className="text-end">Remaining</th><th>Method</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data?.rows.map((s: Json) => (
                  <tr key={s.id} className={s.status === 'VOIDED' ? 'text-muted' : ''}>
                    <td>{formatDateTime(s.createdAt)}</td><td>{s.transactionNumber}</td><td>{s.staff.name}</td><td>{s.customer?.name ?? 'Walk-in'}</td>
                    <td style={{ minWidth: 200 }}>{s.items.map((i: Json) => `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`).join(', ')}</td>
                    <td className="text-end money">{formatPeso(s.totalAmount)}</td><td className="text-end money">{formatPeso(s.amountPaid)}</td>
                    <td className="text-end money">{s.status === 'VOIDED' ? '—' : formatPeso(Number(s.totalAmount) - Number(s.amountPaid))}</td>
                    <td>{[...new Set(s.payments.filter((x: Json) => x.status === 'ACTIVE').map((x: Json) => PAYMENT_METHOD_LABELS[x.paymentMethod]))].join(', ') || 'Credit'}</td>
                    <td><StatusBadge status={s.status === 'VOIDED' ? 'VOIDED' : s.paymentStatus} /></td>
                    <td className="text-nowrap"><a className="btn btn-sm btn-outline-primary me-1" href={`/receipt/${s.id}`} target="_blank" rel="noreferrer">Receipt</a>{s.status === 'COMPLETED' && <button className="btn btn-sm btn-outline-danger" onClick={() => voidSale(s)}>Void</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />}
      </div>
    </div>
  );
}
