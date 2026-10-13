'use client';
import { useState } from 'react';
import { MapPin, Phone } from 'lucide-react';
import { api, useFetch, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { DeliverDialog } from '@/components/deliveries/DeliverDialog';
import { EmptyState, ErrorNote, StatusBadge, TableSkeleton } from '@/components/ui/common';
import { useAsk, useToast } from '@/components/ui/providers';
import { DELIVERY_STATUS_LABELS } from '@/lib/constants';

export default function StaffDeliveries() {
  const { data, loading, error, reload } = useFetch<Json[]>('/api/deliveries', { pollMs: 30000 });
  const [deliver, setDeliver] = useState<Json | null>(null);
  const ask = useAsk();
  const toast = useToast();

  async function setStatus(d: Json, status: string, reason?: string) {
    try {
      await api(`/api/deliveries/${d.id}/status`, { body: { status, reason: reason || null } });
      toast(`Marked ${DELIVERY_STATUS_LABELS[status].toLowerCase()}`);
      reload();
    } catch (e) {
      toast((e as Error).message, 'danger');
    }
  }
  async function fail(d: Json) {
    const r = await ask({ title: 'Delivery failed?', message: `Why could ${d.customer.name} not be served?`, reason: true, danger: true, confirmText: 'Mark failed' });
    if (r.ok) void setStatus(d, 'FAILED', r.reason);
  }

  return (
    <div>
      <h1 className="h5 fw-bold mb-3">Deliveries</h1>
      <ErrorNote message={error} />
      {loading && !data ? <TableSkeleton /> : data?.length === 0 ? <div className="card"><EmptyState title="No deliveries assigned" text="Deliveries the Admin assigns will show up here." /></div> : (
        <div className="d-grid gap-3">
          {data?.map((d) => (
            <div className="card" key={d.id}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <div className="fw-bold">{d.customer.name}</div>
                    <div className="small text-muted-2">{formatDateTime(d.scheduledAt)}</div>
                  </div>
                  <StatusBadge status={d.status} label={DELIVERY_STATUS_LABELS[d.status]} />
                </div>
                <div className="mt-2 d-flex gap-2 flex-wrap">
                  <a className="btn btn-outline-primary btn-sm" href={telHref(d.customer.phone)}><Phone size={14} aria-hidden /> {d.customer.phone}</a>
                </div>
                <div className="mt-2"><MapPin size={14} aria-hidden /> {d.addressSnapshot}</div>
                <ul className="mt-2 mb-2 small">{d.items.map((i: Json) => <li key={i.id}>{i.quantity}× {i.productNameSnapshot} {i.labelSnapshot}</li>)}</ul>
                {d.instructions && <div className="alert alert-info py-1 small">Note: {d.instructions}</div>}
                <div className="d-flex justify-content-between align-items-center">
                  <div><span className="text-muted-2 small">{d.status === 'DELIVERED' ? 'Balance after delivery' : 'Amount to collect'}</span><div className="fw-bold money">{formatPeso(d.amountToCollect)}</div></div>
                  <span className="small text-muted-2">{d.paymentType === 'COD' ? 'Pay on arrival' : 'Credit'}</span>
                </div>
                {(d.status === 'ASSIGNED' || d.status === 'OUT_FOR_DELIVERY') && (
                  <div className="d-flex gap-2 mt-3 flex-wrap">
                    {d.status === 'ASSIGNED' && <button className="btn btn-primary flex-grow-1" onClick={() => setStatus(d, 'OUT_FOR_DELIVERY')}>Out for delivery</button>}
                    <button className="btn btn-success flex-grow-1" onClick={() => setDeliver(d)}>Delivered</button>
                    <button className="btn btn-outline-danger" onClick={() => fail(d)}>Failed</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {deliver && <DeliverDialog delivery={deliver} onClose={() => setDeliver(null)} onDone={() => { setDeliver(null); reload(); }} />}
    </div>
  );
}
