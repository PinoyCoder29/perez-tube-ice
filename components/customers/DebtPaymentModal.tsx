'use client';
import { useRef, useState } from 'react';
import { api, newKey, type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote, Field } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';
import { formatPeso } from '@/lib/formatting';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';

export function DebtPaymentModal({ customer, balance, onClose, onDone }: { customer: Json; balance: string | number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const key = useRef(newKey());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bal = Number(balance);
  const amt = Number(amount) || 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api('/api/payments', { body: { idempotencyKey: key.current, customerId: customer.id, amount, method, notes: notes || null } });
      toast(`Payment of ${formatPeso(amt)} recorded`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Receive payment — ${customer.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-success" disabled={busy || amt <= 0 || amt > bal} onClick={save}>{busy ? 'Saving…' : 'Confirm payment'}</button>
        </>
      }
    >
      <ErrorNote message={error} />
      <div className="d-flex justify-content-between mb-2"><span>Outstanding debt</span><strong className="money">{formatPeso(bal)}</strong></div>
      <Field label="Payment received (₱)">
        <input className="form-control form-control-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      <div className="mb-3"><button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setAmount(bal.toFixed(2))}>Pay full balance</button></div>
      <Field label="Payment method">
        <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)"><input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {amt > bal && <div className="text-danger small">Payment is more than the outstanding balance.</div>}
      {amt > 0 && amt <= bal && <div className="d-flex justify-content-between"><span>Remaining debt</span><strong className="money">{formatPeso(bal - amt)}</strong></div>}
    </Modal>
  );
}
