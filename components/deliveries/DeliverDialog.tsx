'use client';
import { useState } from 'react';
import { api, type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote, Field } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';
import { formatPeso } from '@/lib/formatting';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';

/** Confirms a delivery. Creates exactly one sale (server-side, atomically) and records the payment actually received. */
export function DeliverDialog({ delivery, onClose, onDone }: { delivery: Json; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const total = Number(delivery.itemsTotal) + Number(delivery.deliveryFee);
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState(delivery.paymentType === 'COD' ? total.toFixed(2) : '0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amt = Number(amount) || 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/deliveries/${delivery.id}/status`, { body: { status: 'DELIVERED', payments: amt > 0 ? [{ method, amount: amount }] : [] } });
      toast('Delivery completed');
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Confirm delivery — ${delivery.customer.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" disabled={busy || amt > total || amt < 0} onClick={save}>{busy ? 'Saving…' : 'Mark as delivered'}</button>
        </>
      }
    >
      <ErrorNote message={error} />
      <ul className="small mb-3">
        {delivery.items.map((i: Json) => <li key={i.id}>{i.quantity}× {i.productNameSnapshot} {i.labelSnapshot}</li>)}
        {Number(delivery.deliveryFee) > 0 && <li>Delivery fee {formatPeso(delivery.deliveryFee)}</li>}
      </ul>
      <div className="d-flex justify-content-between fw-bold mb-3"><span>Total</span><span className="money">{formatPeso(total)}</span></div>
      <Field label="Amount collected now (₱)"><input className="form-control form-control-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Payment method">
        <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      {amt > total && <div className="text-danger small">More than the total.</div>}
      {amt >= 0 && amt < total && <div className="alert alert-warning py-2 small mb-0">{formatPeso(total - amt)} will be recorded as utang on this customer&apos;s account.</div>}
    </Modal>
  );
}
