'use client';
import { useState } from 'react';
import { api, useFetch, qs, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { CardTable, EmptyState, ErrorNote, ExportButtons, PageHeader, Pager, PeriodPicker, StatusBadge, TableSkeleton, periodReady, usePeriod } from '@/components/ui/common';
import { PaymentOverview } from '@/components/customers/PaymentOverview';
import { CustomerDetail } from '@/components/customers/CustomerDetail';
import { useAsk, useToast } from '@/components/ui/providers';

function Records() {
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
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3"><PeriodPicker value={p} onChange={(v) => { setP(v); setPage(1); }} /><ExportButtons type="payments-list" params={{ period: p.period, from: p.from, to: p.to, method }} label="Export" /></div>
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <select className="form-select" style={{ maxWidth: 220 }} aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">All payment types</option><option value="SALE_PAYMENT">Paid with a sale</option><option value="DEBT_PAYMENT">Debt payment</option></select>
        <select className="form-select" style={{ maxWidth: 200 }} aria-label="Method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">Any method</option>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No payments in this period" /> : (
          <CardTable><table className="table mb-0 align-middle">
            <thead><tr><th>Date</th><th>Reference</th><th>Customer</th><th>Type</th><th>Method</th><th className="text-end">Amount</th><th>Received by</th><th>Status</th><th /></tr></thead>
            <tbody>{data?.rows.map((x: Json) => (
              <tr key={x.id} className={x.status === 'VOIDED' ? 'text-muted' : ''}><td>{formatDateTime(x.createdAt)}</td><td>{x.paymentReference}</td><td>{x.customer?.name ?? 'Walk-in'}</td><td>{x.paymentType === 'DEBT_PAYMENT' ? 'Debt payment' : `Sale ${x.sale?.transactionNumber ?? ''}`}</td><td>{PAYMENT_METHOD_LABELS[x.paymentMethod]}</td><td className="text-end money">{formatPeso(x.amount)}</td><td>{x.receivedBy.name}</td><td><StatusBadge status={x.status} /></td>
                <td>{x.paymentType === 'DEBT_PAYMENT' && x.status === 'ACTIVE' && <button className="btn btn-sm btn-outline-danger" onClick={() => voidPay(x)}>Void</button>}</td></tr>
            ))}</tbody></table></CardTable>
        )}
        {data && <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />}
      </div>
    </div>
  );
}

export default function AdminPayments() {
  const [tab, setTab] = useState<'overview' | 'records'>('overview');
  const [cust, setCust] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Payments & Collections" subtitle="Paid, unpaid, partially paid, GCash and cash — from confirmed payment records only." />
      <div className="btn-group mb-3" role="tablist"><button role="tab" aria-selected={tab === 'overview'} className={`btn btn-sm ${tab === 'overview' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab('overview')}>Payment overview</button><button role="tab" aria-selected={tab === 'records'} className={`btn btn-sm ${tab === 'records' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab('records')}>All payment records</button></div>
      {tab === 'overview' ? <PaymentOverview admin onOpenCustomer={setCust} /> : <Records />}
      {cust && <CustomerDetail id={cust} onClose={() => setCust(null)} />}
    </div>
  );
}
