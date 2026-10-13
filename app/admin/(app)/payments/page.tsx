'use client';
import { useState } from 'react';
import { api, useFetch, qs, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { EmptyState, ErrorNote, PageHeader, Pager, PeriodPicker, StatusBadge, TableSkeleton, periodReady, usePeriod } from '@/components/ui/common';
import { useAsk, useToast } from '@/components/ui/providers';

export default function AdminPayments() {
  const [p, setP] = usePeriod('today');
  const [type, setType] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch<Json>(periodReady(p) ? `/api/payments${qs({ ...p, type, method, page, pageSize: 25 })}` : null);
  const ask = useAsk();
  const toast = useToast();

  async function voidPay(x: Json) {
    const r = await ask({ title: `Void payment ${x.paymentReference}?`, message: 'The customer’s debt will go back up by this amount. The payment stays on record as voided.', reason: true, danger: true, confirmText: 'Void payment' });
    if (!r.ok) return;
    try { await api(`/api/payments/${x.id}/void`, { body: { reason: r.reason } }); toast('Payment voided'); reload(); } catch (e) { toast((e as Error).message, 'danger'); }
  }

  return (
    <div>
      <PageHeader title="Payments & Collections" subtitle="Every payment received — at the counter and on old utang." actions={<PeriodPicker value={p} onChange={(v) => { setP(v); setPage(1); }} />} />
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <select className="form-select" style={{ maxWidth: 220 }} aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All payment types</option><option value="SALE_PAYMENT">Paid with a sale</option><option value="DEBT_PAYMENT">Debt payment</option></select>
        <select className="form-select" style={{ maxWidth: 200 }} aria-label="Method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">Any method</option>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No payments in this period" /> : (
          <div className="table-responsive"><table className="table mb-0 align-middle">
            <thead><tr><th>Date</th><th>Reference</th><th>Customer</th><th>Type</th><th>Method</th><th className="text-end">Amount</th><th>Received by</th><th>Status</th><th /></tr></thead>
            <tbody>{data?.rows.map((x: Json) => (
              <tr key={x.id} className={x.status === 'VOIDED' ? 'text-muted' : ''}><td>{formatDateTime(x.createdAt)}</td><td>{x.paymentReference}</td><td>{x.customer?.name ?? 'Walk-in'}</td><td>{x.paymentType === 'DEBT_PAYMENT' ? 'Debt payment' : `Sale ${x.sale?.transactionNumber ?? ''}`}</td><td>{PAYMENT_METHOD_LABELS[x.paymentMethod]}</td><td className="text-end money">{formatPeso(x.amount)}</td><td>{x.receivedBy.name}</td><td><StatusBadge status={x.status} /></td>
                <td>{x.paymentType === 'DEBT_PAYMENT' && x.status === 'ACTIVE' && <button className="btn btn-sm btn-outline-danger" onClick={() => voidPay(x)}>Void</button>}</td></tr>
            ))}</tbody></table></div>
        )}
        {data && <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />}
      </div>
    </div>
  );
}
