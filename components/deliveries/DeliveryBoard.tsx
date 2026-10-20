'use client';
import { useState, type ReactNode } from 'react';
import { MapPin, Phone, Search } from 'lucide-react';
import { api, qs, useFetch, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { DELIVERY_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants';
import { DayPicker, EmptyState, ErrorNote, Skeleton, StatusBadge } from '@/components/ui/common';
import { useAsk, useToast } from '@/components/ui/providers';
import { DeliveryPaymentDialog } from './DeliveryPaymentDialog';

const TABS: [string, string][] = [
  ['all', 'All Deliveries'], ['pending', 'Pending'], ['out', 'Out for Delivery'], ['delivered', 'Delivered'],
  ['unpaid', 'Unpaid'], ['partial', 'Partially Paid'], ['paid', 'Paid'], ['gcash', 'GCash'], ['cancelled', 'Cancelled'],
];

/** Shared delivery list for Staff and Admin: tabs, search, date, totals and quick actions. */
export function DeliveryBoard({ admin, extraFilters, header }: { admin?: boolean; extraFilters?: Record<string, string>; header?: ReactNode }) {
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [date, setDate] = useState('');
  const [dlg, setDlg] = useState<{ d: Json; mode: 'deliver' | 'pay' } | null>(null);
  const { data, loading, error, reload } = useFetch<Json>(`/api/deliveries${qs({ tab, q, date, ...extraFilters })}`, { pollMs: 30000 });
  const ask = useAsk();
  const toast = useToast();
  const t = data?.totals;

  async function post(d: Json, body: Json, msg: string) {
    try { await api(`/api/deliveries/${d.id}/status`, { body }); toast(msg); reload(); } catch (e) { toast((e as Error).message, 'danger'); }
  }
  async function fail(d: Json) {
    const r = await ask({ title: 'Delivery failed?', message: `Why could ${d.customer.name} not be served?`, reason: true, danger: true, confirmText: 'Mark failed' });
    if (r.ok) void post(d, { status: 'FAILED', reason: r.reason }, 'Marked failed');
  }
  async function cancel(d: Json) {
    const extra = Number(d.amountPaid) > 0 ? ` ${formatPeso(d.amountPaid)} already recorded as paid will be reversed (refund it to the customer).` : '';
    const r = await ask({ title: `Cancel order ${d.orderNumber}?`, message: `Enter the reason (e.g. “Cancelled by customer”).${extra}`, reason: true, danger: true, confirmText: 'Cancel order' });
    if (r.ok) void post(d, { status: 'CANCELLED', reason: r.reason }, 'Order cancelled');
  }
  async function reverse(d: Json) {
    const r = await ask({ title: `Reverse delivered order ${d.orderNumber}?`, message: 'Admin correction: the sale, payments and debt are reversed with an audit trail and the order is marked cancelled.', reason: true, danger: true, confirmText: 'Reverse order' });
    if (!r.ok) return;
    try { await api(`/api/deliveries/${d.id}/reverse`, { body: { reason: r.reason } }); toast('Order reversed'); reload(); } catch (e) { toast((e as Error).message, 'danger'); }
  }

  const tiles: [string, string | number | undefined][] = [
    ['Orders', t?.orders], ['Delivered', t?.delivered], ['Unpaid', t && formatPeso(t.unpaidAmount)],
    ['Partially paid (balance)', t && formatPeso(t.partialAmount)], ['Paid', t && formatPeso(t.paidAmount)], ['GCash collected', t && formatPeso(t.gcashAmount)],
  ];

  return (
    <div>
      {header}
      <div className="d-flex flex-wrap gap-2 mb-3">
        <div className="input-group" style={{ maxWidth: 420 }}>
          <span className="input-group-text bg-white"><Search size={16} aria-hidden /></span>
          <input className="form-control" placeholder="Name, number, address, order no.…" aria-label="Search deliveries" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="d-flex gap-2 align-items-center">
          <DayPicker value={date || ''} onChange={setDate} />
          {date && <button className="btn btn-sm btn-light" onClick={() => setDate('')}>All dates</button>}
        </div>
      </div>
      <div className="tab-scroll mb-3" role="tablist" aria-label="Delivery filters">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab(k)}>
            {l}<span className="chip-count">{data?.counts?.[k] ?? '…'}</span>
          </button>
        ))}
      </div>
      <div className="row g-2 mb-3">
        {tiles.map(([l, v]) => (
          <div className="col-6 col-md-4 col-xl-2" key={l}><div className="card kpi py-2"><div className="kpi-label">{l}</div>{v === undefined ? <Skeleton h={22} w="60%" /> : <div className="fw-bold money">{v}</div>}</div></div>
        ))}
      </div>
      <ErrorNote message={error} />
      {loading && !data ? <div className="d-grid gap-2">{[1, 2, 3].map((i) => <Skeleton key={i} h={130} />)}</div> : data?.rows.length === 0 ? <div className="card"><EmptyState title="No deliveries here" text="Try another tab, date or search." /></div> : (
        <div className="row g-3">
          {data?.rows.map((d: Json) => {
            const cancelled = d.status === 'CANCELLED';
            const open = ['PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY'].includes(d.status);
            return (
              <div className="col-12 col-xl-6" key={d.id}>
                <div className={`card order-card h-100 st-${cancelled ? 'cancelled' : d.paymentStatus.toLowerCase()}`}>
                  <div className="card-body">
                    <div className="d-flex justify-content-between gap-2 flex-wrap">
                      <div className="wrap-any">
                        <div className="fw-bold">{d.customer.name}</div>
                        <a className="btn btn-outline-primary btn-sm mt-1" href={telHref(d.customer.phone)}><Phone size={14} aria-hidden /> {d.customer.phone}</a>
                      </div>
                      <div className="text-end">
                        <StatusBadge status={d.status} label={DELIVERY_STATUS_LABELS[d.status]} />
                        {!cancelled && <div className="mt-1"><StatusBadge status={d.paymentStatus} label={PAYMENT_STATUS_LABELS[d.paymentStatus]} /></div>}
                        <div className="small text-muted-2 mt-1">{d.orderNumber}</div>
                      </div>
                    </div>
                    <div className="mt-2 wrap-any"><MapPin size={14} aria-hidden /> {d.addressSnapshot}</div>
                    <div className="small text-muted-2">{d.hasTime ? formatDateTime(d.scheduledAt) : `${new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(d.scheduledAt))} (any time)`}</div>
                    <ul className="mt-2 mb-2 small ps-3">{d.items.map((i: Json) => <li key={i.id}>{i.quantity}× {i.productNameSnapshot} {i.labelSnapshot} @ {formatPeso(i.unitPrice)} = {formatPeso(i.lineTotal)}{i.pricingSource === 'CUSTOMER' ? ' · customer price' : i.pricingSource === 'CUSTOM' ? ' · custom price' : ''}</li>)}</ul>
                    {d.instructions && <div className="alert alert-info py-1 small mb-2">Note: {d.instructions}</div>}
                    {cancelled && <div className="small mb-2"><strong>Cancelled</strong>{d.cancelledAt ? ` ${formatDateTime(d.cancelledAt)}` : ''}{d.cancelledByName ? ` by ${d.cancelledByName}` : ''} — {d.cancelReason}</div>}
                    {d.status === 'DELIVERED' && <div className="small mb-2 text-muted-2">Delivered {formatDateTime(d.deliveredAt)}{d.deliveredByName ? ` · ${d.deliveredByName}` : ''}</div>}
                    {d.status === 'FAILED' && d.statusReason && <div className="small mb-2">Failed: {d.statusReason}</div>}
                    <div className="row g-2 text-center small mb-2">
                      <div className="col-4"><div className="text-muted-2">Order total</div><div className="fw-semibold money">{formatPeso(d.orderTotal)}</div></div>
                      <div className="col-4"><div className="text-muted-2">Paid</div><div className="fw-semibold money">{formatPeso(d.amountPaid)}</div></div>
                      <div className="col-4"><div className="text-muted-2">Remaining</div><div className={`fw-bold money ${Number(d.amountDue) > 0 ? 'text-danger' : ''}`}>{formatPeso(d.amountDue)}</div></div>
                    </div>
                    {d.paymentMethods.length > 0 && <div className="small text-muted-2">Paid via {d.paymentMethods.map((m: Json) => `${PAYMENT_METHOD_LABELS[m.method]} ${formatPeso(m.amount)}`).join(', ')}{d.references.length ? ` · ref ${d.references.join(', ')}` : ''}{d.lastPaymentAt ? ` · last ${formatDateTime(d.lastPaymentAt)}` : ''}</div>}
                    {!cancelled && (
                      <div className="d-flex flex-wrap gap-2 mt-3">
                        {['PENDING', 'ASSIGNED'].includes(d.status) && <button className="btn btn-outline-primary" onClick={() => post(d, { status: 'OUT_FOR_DELIVERY' }, 'Out for delivery')}>Out for delivery</button>}
                        {open && <button className="btn btn-success flex-grow-1" onClick={() => setDlg({ d, mode: 'deliver' })}>Mark as delivered</button>}
                        {Number(d.amountDue) > 0 && <button className="btn btn-outline-success" onClick={() => setDlg({ d, mode: 'pay' })}>Record payment</button>}
                        {open && <button className="btn btn-outline-danger" onClick={() => cancel(d)}>Cancel order</button>}
                        {['ASSIGNED', 'OUT_FOR_DELIVERY'].includes(d.status) && <button className="btn btn-outline-secondary" onClick={() => fail(d)}>Failed</button>}
                        {admin && d.status === 'DELIVERED' && <button className="btn btn-outline-danger" onClick={() => reverse(d)}>Reverse (Admin)</button>}
                        {d.sale && <a className="btn btn-link" href={`/receipt/${d.sale.id}`} target="_blank" rel="noreferrer">Receipt</a>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {dlg && <DeliveryPaymentDialog delivery={dlg.d} mode={dlg.mode} onClose={() => setDlg(null)} onDone={() => { setDlg(null); reload(); }} />}
    </div>
  );
}
