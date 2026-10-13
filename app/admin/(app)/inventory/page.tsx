'use client';
import { useState } from 'react';
import { api, useFetch, type Json } from '@/lib/client/api';
import { formatDateTime, formatQty } from '@/lib/formatting';
import { MOVEMENT_LABELS } from '@/lib/constants';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorNote, Field, PageHeader, StatusBadge, TableSkeleton } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

function MovementForm({ product, onClose, onSaved }: { product: Json; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [type, setType] = useState('RECEIVED');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try { await api('/api/inventory', { body: { productId: product.id, movementType: type, quantity, reason: reason || null } }); toast('Stock updated'); onSaved(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title={`Stock — ${product.name}`} onClose={onClose} footer={<><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!(Number(quantity) > 0)} onClick={save}>Record</button></>}>
      <ErrorNote message={err} />
      <Field label="Type"><select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>{['OPENING', 'RECEIVED', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'].map((t) => <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>)}</select></Field>
      <Field label={`Quantity (${product.stockUnit})`}><input className="form-control" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus /></Field>
      <Field label="Reason / note"><input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

export default function InventoryPage() {
  const inv = useFetch<Json[]>('/api/inventory');
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Json | null>(null);
  const mv = useFetch<Json[]>(`/api/inventory/movements${sel ? `?productId=${sel}` : ''}`);
  const refresh = () => { inv.reload(); mv.reload(); };
  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock is only tracked for products where you turn tracking on in Products & Pricing. Stock used per price button is set there too — it is never guessed." />
      <ErrorNote message={inv.error} />
      <div className="card mb-4">
        {inv.loading && !inv.data ? <TableSkeleton /> : (
          <div className="table-responsive"><table className="table mb-0 align-middle">
            <thead><tr><th>Product</th><th className="text-end">Current stock</th><th className="text-end">Low-stock threshold</th><th>Status</th><th /></tr></thead>
            <tbody>{inv.data?.map((p) => (
              <tr key={p.id}><td className="fw-semibold">{p.name}</td>
                <td className="text-end">{p.configured ? `${formatQty(p.currentStock)} ${p.stockUnit}` : <span className="text-muted-2">Not configured</span>}</td>
                <td className="text-end">{p.lowStockThreshold ? formatQty(p.lowStockThreshold) : '—'}</td>
                <td>{!p.configured ? <StatusBadge status="CANCELLED" label="Not tracked" /> : p.low ? <StatusBadge status="LOW" label="Low stock" /> : <StatusBadge status="OK" label="OK" />}</td>
                <td className="text-nowrap">{p.configured && <button className="btn btn-sm btn-primary me-1" onClick={() => setForm(p)}>Add / adjust</button>}<button className="btn btn-sm btn-outline-primary" onClick={() => setSel(sel === p.id ? null : p.id)}>{sel === p.id ? 'All movements' : 'History'}</button></td></tr>
            ))}</tbody></table></div>
        )}
      </div>
      <h2 className="h6">Stock movements</h2>
      <div className="card">
        {mv.data?.length === 0 ? <EmptyState title="No stock movements yet" /> : (
          <div className="table-responsive"><table className="table table-sm mb-0">
            <thead><tr><th>Date</th><th>Product</th><th>Type</th><th className="text-end">Quantity</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>{mv.data?.map((m) => <tr key={m.id}><td>{formatDateTime(m.createdAt)}</td><td>{m.product.name}</td><td>{MOVEMENT_LABELS[m.movementType]}</td><td className="text-end">{formatQty(m.quantity)}</td><td>{m.reason}</td><td>{m.recordedBy.name}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {form && <MovementForm product={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </div>
  );
}
