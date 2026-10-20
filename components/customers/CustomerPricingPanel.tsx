'use client';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, useFetch, type Json } from '@/lib/client/api';
import { formatDate, formatPeso } from '@/lib/formatting';
import { PACKAGE_LABELS } from '@/lib/constants';
import { CardTable, EmptyState, ErrorNote, Field, StatusBadge } from '@/components/ui/common';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/providers';

function PriceForm({ customerId, options, initial, onClose, onSaved }: { customerId: string; options: Json[]; initial?: Json; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [optionId, setOptionId] = useState(initial?.priceOptionId ?? '');
  const [price, setPrice] = useState(initial ? Number(initial.sellingPrice).toFixed(2) : '');
  const [minQty, setMinQty] = useState(String(initial?.minQuantity ?? 1));
  const [date, setDate] = useState(initial ? new Date(initial.effectiveFrom).toISOString().slice(0, 10) : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { sellingPrice: price, minQuantity: Number(minQty) || 1, ...(date ? { effectiveFrom: `${date}T00:00:00+08:00` } : {}) };
      if (initial) await api(`/api/customer-prices/${initial.id}`, { method: 'PATCH', body });
      else await api(`/api/customers/${customerId}/prices`, { body: { ...body, priceOptionId: optionId } });
      toast('Customer price saved — applies to future orders only');
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <Modal title={initial ? 'Edit customer price' : 'New customer price'} onClose={onClose} footer={<><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !price || (!initial && !optionId)} onClick={save}>Save</button></>}>
      <ErrorNote message={err} />
      {!initial && (
        <Field label="Product & package" hint="Packages come from Products & Pricing (add a half-sack / multi-sack package there first).">
          <select className="form-select" value={optionId} onChange={(e) => setOptionId(e.target.value)}>
            <option value="">Choose…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.product.name} — {o.label} ({PACKAGE_LABELS[o.packageType]}){o.active ? ` · standard ${formatPeso(o.sellingPrice)}` : ' · no standard price'}</option>)}
          </select>
        </Field>
      )}
      <div className="row g-2">
        <div className="col-6"><Field label="Price per unit (₱)"><input className="form-control" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field></div>
        <div className="col-6"><Field label="Applies from quantity" hint="1 = always. Use 3 for a rule like “3 or more”."><input type="number" min={1} className="form-control" value={minQty} onChange={(e) => setMinQty(e.target.value)} /></Field></div>
        <div className="col-12"><Field label="Effective date (optional)"><input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

/** Admin-only: customer-specific prices. Rows are deactivated, never deleted. */
export function CustomerPricingPanel({ customerId }: { customerId: string }) {
  const { data, loading, error, reload } = useFetch<Json>(`/api/customers/${customerId}/prices`);
  const [form, setForm] = useState<{ initial?: Json } | null>(null);
  const toast = useToast();
  async function toggle(p: Json) {
    try { await api(`/api/customer-prices/${p.id}`, { method: 'PATCH', body: { active: !p.active } }); toast(p.active ? 'Deactivated' : 'Activated'); reload(); } catch (e) { toast((e as Error).message, 'danger'); }
  }
  return (
    <section className="mb-4" aria-label="Customer pricing">
      <div className="d-flex justify-content-between align-items-center mb-2"><h6 className="mb-0">Customer pricing</h6><button className="btn btn-sm btn-primary" onClick={() => setForm({})}><Plus size={14} aria-hidden /> Add price</button></div>
      <ErrorNote message={error} />
      {loading && !data ? <div className="small text-muted-2">Loading…</div> : data?.prices.length === 0 ? <div className="card"><EmptyState title="No customer-specific prices" text="This customer pays the standard price for every package." /></div> : (
        <div className="card">
          <CardTable>
            <table className="table table-sm mb-0 align-middle">
              <thead><tr><th>Product / package</th><th className="text-end">Customer price</th><th>From qty</th><th>Standard</th><th>Effective</th><th>Updated by</th><th>Status</th><th /></tr></thead>
              <tbody>{data?.prices.map((p: Json) => (
                <tr key={p.id}>
                  <td>{p.priceOption.product.name} — {p.priceOption.label}</td>
                  <td className="text-end money fw-semibold">{formatPeso(p.sellingPrice)}</td>
                  <td>{p.minQuantity}+</td>
                  <td className="money">{p.priceOption.active ? formatPeso(p.priceOption.sellingPrice) : '—'}</td>
                  <td>{formatDate(p.effectiveFrom)}</td>
                  <td>{p.updatedBy.name}<div className="small text-muted-2">{formatDate(p.updatedAt)}</div></td>
                  <td><StatusBadge status={p.active ? 'ACTIVE' : 'CANCELLED'} label={p.active ? 'Active' : 'Inactive'} /></td>
                  <td className="text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" onClick={() => setForm({ initial: p })}><Pencil size={13} aria-hidden /> Edit</button><button className="btn btn-sm btn-outline-secondary" onClick={() => toggle(p)}>{p.active ? 'Deactivate' : 'Activate'}</button></td>
                </tr>))}</tbody>
            </table>
          </CardTable>
        </div>
      )}
      {form && data && <PriceForm customerId={customerId} options={data.options} initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </section>
  );
}
