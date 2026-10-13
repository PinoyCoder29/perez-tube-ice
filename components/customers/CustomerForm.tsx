'use client';
import { useState } from 'react';
import { api, type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote, Field } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

export function CustomerForm({ initial, admin, onClose, onSaved }: { initial?: Json; admin?: boolean; onClose: () => void; onSaved: (c: Json) => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    landmark: initial?.landmark ?? '',
    notes: initial?.notes ?? '',
    active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { ...f, ...(admin ? {} : { notes: undefined }) };
      const c = initial ? await api(`/api/customers/${initial.id}`, { method: 'PATCH', body }) : await api('/api/customers', { body });
      toast(initial ? 'Customer updated' : 'Customer added');
      onSaved(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={initial ? 'Edit customer' : 'New customer'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !f.name || !f.phone || !f.address} onClick={save}>{busy ? 'Saving…' : 'Save customer'}</button>
        </>
      }
    >
      <ErrorNote message={error} />
      <Field label="Full name"><input className="form-control" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
      <Field label="Contact number" hint="09XXXXXXXXX or +639XXXXXXXXX"><input className="form-control" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      <Field label="Delivery address"><input className="form-control" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
      <Field label="Landmark (optional)"><input className="form-control" value={f.landmark} onChange={(e) => set('landmark', e.target.value)} /></Field>
      {admin && <Field label="Notes (optional)"><textarea className="form-control" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>}
      {admin && initial && (
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" id="cust-active" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          <label className="form-check-label" htmlFor="cust-active">Active customer</label>
        </div>
      )}
    </Modal>
  );
}
