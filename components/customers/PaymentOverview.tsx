'use client';
import { useState } from 'react';
import { Phone } from 'lucide-react';
import { useFetch, qs, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants';
import { CardTable, EmptyState, ErrorNote, PeriodPicker, Skeleton, StatusBadge, periodReady, usePeriod } from '@/components/ui/common';

/** Paid / unpaid / partially paid / GCash / cash overview. Only confirmed payment records count as money collected. */
export function PaymentOverview({ admin, onOpenCustomer }: { admin?: boolean; onOpenCustomer?: (id: string) => void }) {
  const [p, setP] = usePeriod('month');
  const [all, setAll] = useState(false);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const period = admin && all ? 'all' : p.period;
  const { data, loading, error } = useFetch<Json>(periodReady(p) || all ? `/api/payment-overview${qs({ period, from: p.from, to: p.to, status, method, q })}` : null, { pollMs: 60000 });
  const t = data?.totals;
  const tiles: [string, string | undefined, string?][] = [
    ['Total unpaid', t && formatPeso(t.unpaidAmount), 'Orders with nothing paid'],
    ['Partially paid balance', t && formatPeso(t.partialBalance), 'Still owed on part-paid orders'],
    ['Fully paid', t && formatPeso(t.paidAmount), 'In the selected period'],
    ['GCash collected', t && formatPeso(t.gcashCollected), 'Confirmed GCash payments'],
    ['Cash collected', t && formatPeso(t.cashCollected), 'Confirmed cash payments'],
    ['Total outstanding debt', t && formatPeso(t.outstandingDebt), 'All customers, as of now'],
  ];
  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <PeriodPicker value={p} onChange={(v) => { setP(v); setAll(false); }} />
        {admin && <div className="form-check"><input id="po-all" className="form-check-input" type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><label htmlFor="po-all" className="form-check-label">All dates</label></div>}
      </div>
      <div className="row g-2 mb-3">
        {tiles.map(([l, v, h]) => (
          <div className="col-6 col-lg-4 col-xl-2" key={l}><div className="card kpi py-2"><div className="kpi-label">{l}</div>{v === undefined ? <Skeleton h={22} w="60%" /> : <div className="fw-bold money">{v}</div>}<div className="small text-muted-2">{h}</div></div></div>
        ))}
      </div>
      {t && <div className="small text-muted-2 mb-3">GCash orders: value of orders paid at least partly by GCash is <strong className="money">{formatPeso(t.gcashOrderValue)}</strong> — different from GCash money actually collected above. Other digital collected: {formatPeso(t.otherDigitalCollected)}.</div>}
      <div className="d-flex flex-wrap gap-2 mb-3">
        <input className="form-control" style={{ maxWidth: 280 }} placeholder="Customer, phone or reference…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="form-select" style={{ maxWidth: 190 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partially paid</option><option value="PAID">Paid</option></select>
        <select className="form-select" style={{ maxWidth: 170 }} aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Any method</option><option value="GCASH">GCash</option><option value="CASH">Cash</option></select>
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <div className="p-3"><Skeleton h={90} /></div> : data?.rows.length === 0 ? <EmptyState title="No records for this selection" /> : (
          <CardTable>
            <table className="table mb-0 align-middle">
              <thead><tr><th>Customer</th><th className="text-end">Balance</th><th>Status</th><th>Reference</th><th className="text-end">Original</th><th className="text-end">Paid</th><th>Method(s)</th><th>Last payment</th></tr></thead>
              <tbody>
                {data?.rows.map((r: Json) => (
                  <tr key={r.key}>
                    <td><div className="fw-semibold">{onOpenCustomer && r.customerId ? <button className="btn btn-link p-0 text-start fw-semibold" onClick={() => onOpenCustomer(r.customerId)}>{r.customer}</button> : r.customer}</div>{r.phone && <a className="small" href={telHref(r.phone)}><Phone size={12} aria-hidden /> {r.phone}</a>}</td>
                    <td className={`text-end money fw-bold ${r.balance > 0 ? 'text-danger' : ''}`}>{formatPeso(r.balance)}</td>
                    <td><StatusBadge status={r.status} label={PAYMENT_STATUS_LABELS[r.status]} /></td>
                    <td>{r.kind === 'ORDER' ? `${r.reference} (order)` : r.reference}{r.deliveryRef && r.kind === 'SALE' ? <div className="small text-muted-2">{r.deliveryRef}</div> : null}</td>
                    <td className="text-end money">{formatPeso(r.total)}</td><td className="text-end money">{formatPeso(r.paid)}</td>
                    <td>{r.methods.map((m: Json) => `${PAYMENT_METHOD_LABELS[m.method]} ${formatPeso(m.amount)}`).join(', ') || '—'}</td>
                    <td>{r.lastPaymentAt ? formatDateTime(r.lastPaymentAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
        )}
        {data && data.total > data.rows.length && <div className="p-3 small text-muted-2 border-top">Showing the first {data.rows.length} of {data.total}. Narrow the filters or use Export for everything.</div>}
      </div>
    </div>
  );
}
