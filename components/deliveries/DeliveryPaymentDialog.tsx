'use client';
import { useRef, useState } from 'react';
import { api, newKey, type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote, Field } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';
import { formatPeso } from '@/lib/formatting';

type Choice = 'CASH' | 'GCASH' | 'PARTIAL' | 'UNPAID';

/**
 * Records real payments for a delivery order, and (mode "deliver") confirms delivery.
 * Delivery never marks an order paid by itself: only the payment chosen here creates payment records.
 */
export function DeliveryPaymentDialog({ delivery, mode, onClose, onDone }: { delivery: Json; mode: 'deliver' | 'pay'; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const key = useRef(newKey());
  const due = Number(delivery.amountDue);
  const [choice, setChoice] = useState<Choice>('UNPAID');
  const [amount, setAmount] = useState('');
  const [partialMethod, setPartialMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (c: Choice) => {
    setChoice(c);
    setAmount(c === 'CASH' || c === 'GCASH' ? due.toFixed(2) : '');
  };
  const method = choice === 'CASH' ? 'CASH' : choice === 'GCASH' ? 'GCASH' : partialMethod;
  const amt = Number(amount) || 0;
  const needsPayment = choice !== 'UNPAID';
  const invalid = needsPayment && (amt <= 0 || amt > due || (choice !== 'PARTIAL' && Math.abs(amt - due) > 0.004));
  const gcash = method === 'GCASH';

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const pay = needsPayment ? { method, amount: amt.toFixed(2), reference: gcash && reference ? reference : null, notes: note || null } : null;
      if (mode === 'deliver') {
        await api(`/api/deliveries/${delivery.id}/status`, { body: { status: 'DELIVERED', idempotencyKey: key.current, payments: pay ? [pay] : [] } });
        toast(pay ? `Delivered — ${formatPeso(amt)} received` : 'Delivered — payment still due');
      } else if (pay) {
        await api(`/api/deliveries/${delivery.id}/payment`, { body: { idempotencyKey: key.current, ...pay } });
        toast(`Payment of ${formatPeso(amt)} recorded`);
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const title = mode === 'deliver' ? `Mark as delivered — ${delivery.customer.name}` : `Record payment — ${delivery.customer.name}`;
  const choices: [Choice, string][] = [['CASH', 'Paid — Cash'], ['GCASH', 'Paid — GCash'], ['PARTIAL', 'Partially paid'], ['UNPAID', mode === 'deliver' ? 'Unpaid / collect later' : 'Unpaid / collect later']];
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Back</button>
          <button className={`btn ${mode === 'deliver' ? 'btn-success' : 'btn-primary'}`} disabled={busy || invalid || (mode === 'pay' && !needsPayment)} onClick={save}>
            {busy ? 'Saving…' : mode === 'deliver' ? 'Confirm delivered' : 'Save payment'}
          </button>
        </>
      }
    >
      <ErrorNote message={error} />
      <ul className="small mb-2 ps-3">
        {delivery.items.map((i: Json) => <li key={i.id}>{i.quantity}× {i.productNameSnapshot} {i.labelSnapshot}</li>)}
        {Number(delivery.deliveryFee) > 0 && <li>Delivery fee {formatPeso(delivery.deliveryFee)}</li>}
      </ul>
      <div className="d-flex justify-content-between"><span>Order total</span><strong className="money">{formatPeso(delivery.orderTotal)}</strong></div>
      <div className="d-flex justify-content-between"><span>Already paid</span><span className="money">{formatPeso(delivery.amountPaid)}</span></div>
      <div className="d-flex justify-content-between mb-3"><span>Remaining due</span><strong className="money text-danger">{formatPeso(due)}</strong></div>
      {mode === 'deliver' && <div className="alert alert-info py-2 small">Delivering does not mark the order as paid. Choose what was actually received.</div>}
      <div className="row g-2 mb-3" role="group" aria-label="Payment">
        {choices.map(([c, l]) => (
          <div className="col-6" key={c}><button type="button" className={`btn w-100 ${choice === c ? 'btn-primary' : 'btn-outline-primary'}`} disabled={due <= 0 && c !== 'UNPAID'} onClick={() => pick(c)}>{l}</button></div>
        ))}
      </div>
      {needsPayment && (
        <>
          <Field label={`Amount received (₱)${choice === 'PARTIAL' ? ` — less than ${formatPeso(due)}` : ''}`}>
            <input className="form-control form-control-lg" inputMode="decimal" value={amount} readOnly={choice !== 'PARTIAL'} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {choice === 'PARTIAL' && (
            <Field label="Paid with"><select className="form-select" value={partialMethod} onChange={(e) => setPartialMethod(e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option></select></Field>
          )}
          {gcash && <Field label="GCash reference no. (optional)"><input className="form-control" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
          <Field label="Note (optional)"><input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {choice === 'PARTIAL' && amt > 0 && amt < due && <div className="small">Remaining after this payment: <strong>{formatPeso(due - amt)}</strong></div>}
          {choice === 'PARTIAL' && amt >= due && due > 0 && <div className="small text-danger">For a full payment use Paid — Cash or GCash.</div>}
        </>
      )}
      {!needsPayment && <div className="small text-muted-2">{mode === 'deliver' ? `${formatPeso(due)} stays unpaid and is recorded as utang on this customer’s account.` : 'Nothing will be recorded.'}</div>}
    </Modal>
  );
}
