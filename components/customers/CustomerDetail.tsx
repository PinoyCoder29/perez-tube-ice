'use client';
import { useState, type ReactNode } from 'react';
import { Phone, Plus } from 'lucide-react';
import { useFetch, type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { CardTable, EmptyState, ErrorNote, StatusBadge, TableSkeleton } from '@/components/ui/common';
import { formatDate, formatDateTime, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { DELIVERY_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants';
import { DebtPaymentModal } from './DebtPaymentModal';
import { CustomerPricingPanel } from './CustomerPricingPanel';
import { DeliveryForm } from '@/components/deliveries/DeliveryForm';

export function CustomerDetail({ id, onClose, extraActions, onChanged, admin }: { id: string; onClose: () => void; extraActions?: (c: Json) => ReactNode; onChanged?: () => void; admin?: boolean }) {
  const { data, loading, error, reload } = useFetch<Json>(`/api/customers/${id}`);
  const [paying, setPaying] = useState(false);
  const [creating, setCreating] = useState(false);
  const c = data?.customer;
  const s = data?.summary;
  const unpaid = (data?.sales ?? []).filter((t: Json) => t.status === 'COMPLETED' && t.paymentStatus !== 'PAID');
  const debtPays = (data?.payments ?? []).filter((p: Json) => p.paymentType === 'DEBT_PAYMENT');

  return (
    <Modal title={c?.name ?? 'Customer'} onClose={onClose} size="xl">
      <ErrorNote message={error} />
      {loading && !data ? <TableSkeleton /> : c && s ? (
        <>
          <div className="d-flex flex-wrap gap-3 justify-content-between mb-3">
            <div className="wrap-any">
              <a className="btn btn-outline-primary btn-sm mb-2" href={telHref(c.phone)}><Phone size={14} aria-hidden /> Call {c.phone}</a>
              <div>{c.address}{c.landmark ? ` (${c.landmark})` : ''}</div>
              {c.notes && <div className="small text-muted-2">Notes: {c.notes}</div>}
              {!c.active && <StatusBadge status="CANCELLED" label="Inactive" />}
            </div>
            <div className="d-flex gap-2 flex-wrap align-items-start">
              {c.active && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14} aria-hidden /> Create new delivery</button>}
              {Number(s.outstandingBalance) > 0 && <button className="btn btn-success" onClick={() => setPaying(true)}>Receive payment</button>}
              {extraActions?.(c)}
            </div>
          </div>
          <div className="row g-2 mb-4">
            {[['Outstanding debt', s.outstandingBalance], ['Total purchases', s.totalPurchases], ['Total payments', s.totalPayments], ['Cash collected', s.cashCollected], ['GCash collected', s.gcashCollected], ['Debt payments', s.debtPayments]].map(([l, v]) => (
              <div className="col-6 col-md-4 col-xl-2" key={l as string}><div className="card kpi py-2"><div className="kpi-label">{l}</div><div className="fw-bold money">{formatPeso(v as string)}</div></div></div>
            ))}
          </div>

          {admin && <CustomerPricingPanel customerId={id} />}

          <h6>Delivery history</h6>
          {data.deliveries.length === 0 ? (
            <div className="card mb-4"><EmptyState title="No delivery orders yet" action={c.active ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>Create the first delivery</button> : undefined} /></div>
          ) : (
            <div className="card mb-4"><CardTable>
              <table className="table table-sm mb-0 align-middle">
                <thead><tr><th>Order</th><th className="text-end">Remaining</th><th>Payment</th><th>Delivery</th><th>Ordered</th><th>Requested</th><th>Products</th><th className="text-end">Total</th><th className="text-end">Paid</th></tr></thead>
                <tbody>{data.deliveries.map((d: Json) => (
                  <tr key={d.id}>
                    <td>{d.orderNumber}</td>
                    <td className={`text-end money fw-semibold ${Number(d.amountDue) > 0 ? 'text-danger' : ''}`}>{formatPeso(d.amountDue)}</td>
                    <td>{d.status === 'CANCELLED' ? '—' : <StatusBadge status={d.paymentStatus} label={PAYMENT_STATUS_LABELS[d.paymentStatus]} />}</td>
                    <td><StatusBadge status={d.status} label={DELIVERY_STATUS_LABELS[d.status]} />{d.status === 'CANCELLED' && <div className="small text-muted-2">{formatDateTime(d.cancelledAt)} — {d.cancelReason}</div>}</td>
                    <td>{formatDate(d.createdAt)}</td><td>{d.hasTime ? formatDateTime(d.scheduledAt) : formatDate(d.scheduledAt)}</td>
                    <td>{d.items.map((i: Json) => `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot} @ ${formatPeso(i.unitPrice)}${i.pricingSource === 'CUSTOMER' ? ' (customer price)' : i.pricingSource === 'CUSTOM' ? ' (custom)' : ''}`).join('; ')}</td>
                    <td className="text-end money">{formatPeso(d.orderTotal)}</td><td className="text-end money">{formatPeso(d.amountPaid)}</td>
                  </tr>))}</tbody>
              </table>
            </CardTable></div>
          )}

          <h6>Unpaid &amp; partially paid</h6>
          {unpaid.length === 0 ? <div className="text-muted-2 small mb-4">Nothing unpaid.</div> : (
            <div className="card mb-4"><CardTable><table className="table table-sm mb-0"><thead><tr><th>Transaction</th><th className="text-end">Remaining</th><th>Status</th><th>Date</th><th className="text-end">Total</th><th className="text-end">Paid</th></tr></thead>
              <tbody>{unpaid.map((t: Json) => <tr key={t.id}><td><a href={`/receipt/${t.id}`} target="_blank" rel="noreferrer">{t.transactionNumber}</a></td><td className="text-end money fw-semibold text-danger">{formatPeso(Number(t.totalAmount) - Number(t.amountPaid))}</td><td><StatusBadge status={t.paymentStatus} label={PAYMENT_STATUS_LABELS[t.paymentStatus]} /></td><td>{formatDate(t.createdAt)}</td><td className="text-end money">{formatPeso(t.totalAmount)}</td><td className="text-end money">{formatPeso(t.amountPaid)}</td></tr>)}</tbody></table></CardTable></div>
          )}

          <h6>Previous credit purchases</h6>
          {data.creditPurchases.length === 0 ? <div className="text-muted-2 small mb-4">No credit purchases.</div> : (
            <div className="card mb-4"><CardTable><table className="table table-sm mb-0"><thead><tr><th>Transaction</th><th className="text-end">Charged to account</th><th>Date</th><th>Sale status</th></tr></thead>
              <tbody>{data.creditPurchases.map((x: Json) => <tr key={x.id}><td>{x.sale ? <a href={`/receipt/${x.sale.id}`} target="_blank" rel="noreferrer">{x.sale.transactionNumber}</a> : '—'}</td><td className="text-end money">{formatPeso(x.charged)}</td><td>{formatDate(x.createdAt)}</td><td>{x.sale?.status === 'VOIDED' ? <StatusBadge status="VOIDED" /> : x.sale ? <StatusBadge status={x.sale.paymentStatus} label={PAYMENT_STATUS_LABELS[x.sale.paymentStatus]} /> : ''}</td></tr>)}</tbody></table></CardTable></div>
          )}

          <h6>Previous debt payments</h6>
          {debtPays.length === 0 ? <div className="text-muted-2 small mb-4">No debt payments.</div> : (
            <div className="card mb-4"><CardTable><table className="table table-sm mb-0"><thead><tr><th>Reference</th><th className="text-end">Amount</th><th>Method</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>{debtPays.map((p: Json) => <tr key={p.id}><td>{p.paymentReference}</td><td className="text-end money">{formatPeso(p.amount)}</td><td>{PAYMENT_METHOD_LABELS[p.paymentMethod]}{p.reference ? ` · ${p.reference}` : ''}</td><td>{formatDateTime(p.createdAt)}</td><td><StatusBadge status={p.status} /></td></tr>)}</tbody></table></CardTable></div>
          )}

          <h6>Purchase history</h6>
          {data.sales.length === 0 ? <EmptyState title="No purchases yet." /> : (
            <div className="card"><CardTable>
              <table className="table table-sm align-middle mb-0">
                <thead><tr><th>Transaction</th><th className="text-end">Remaining</th><th>Status</th><th>Date</th><th>Products</th><th className="text-end">Total</th><th>Method</th><th className="text-end">Paid</th></tr></thead>
                <tbody>
                  {data.sales.map((t: Json) => (
                    <tr key={t.id}>
                      <td><a href={`/receipt/${t.id}`} target="_blank" rel="noreferrer">{t.transactionNumber}</a></td>
                      <td className="text-end money">{t.status === 'VOIDED' ? '—' : formatPeso(Number(t.totalAmount) - Number(t.amountPaid))}</td>
                      <td><StatusBadge status={t.status === 'VOIDED' ? 'VOIDED' : t.paymentStatus} label={t.status === 'VOIDED' ? 'Voided' : PAYMENT_STATUS_LABELS[t.paymentStatus]} /></td>
                      <td>{formatDateTime(t.createdAt)}</td>
                      <td>{t.items.map((i: Json) => `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`).join(', ')}</td>
                      <td className="text-end money">{formatPeso(t.totalAmount)}</td>
                      <td>{[...new Set(t.payments.filter((p: Json) => p.status === 'ACTIVE').map((p: Json) => PAYMENT_METHOD_LABELS[p.paymentMethod]))].join(', ') || 'Credit'}</td>
                      <td className="text-end money">{formatPeso(t.amountPaid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardTable></div>
          )}
          {paying && <DebtPaymentModal customer={c} balance={s.outstandingBalance} onClose={() => setPaying(false)} onDone={() => { setPaying(false); reload(); onChanged?.(); }} />}
          {creating && <DeliveryForm admin={admin} customer={c} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); onChanged?.(); }} />}
        </>
      ) : null}
    </Modal>
  );
}
