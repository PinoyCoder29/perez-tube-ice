'use client';
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { api, useFetch, type Json } from '@/lib/client/api';
import { formatPeso } from '@/lib/formatting';
import { PACKAGE_LABELS } from '@/lib/constants';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorNote, Field, PageHeader, StatusBadge, TableSkeleton } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

function PriceForm({ product, initial, onClose, onSaved }: { product: Json; initial?: Json; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    label: initial?.label ?? '',
    packageType: initial?.packageType ?? 'RETAIL',
    sellingPrice: initial?.sellingPrice ? Number(initial.sellingPrice).toFixed(2) : '',
    unitDescription: initial?.unitDescription ?? '',
    sacksPerUnit: initial?.sacksPerUnit ? String(Number(initial.sacksPerUnit)) : '',
    inventoryQuantityPerUnit: initial?.inventoryQuantityPerUnit ? String(Number(initial.inventoryQuantityPerUnit)) : '',
    sortOrder: initial?.sortOrder ?? 0,
    active: initial?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string | number | boolean) => setF((x) => ({ ...x, [k]: v }));
  const pkgDefaults = (t: string) => ({ HALF_SACK: '0.5', FULL_SACK: '1' } as Record<string, string>)[t] ?? '';

  async function save() {
    setBusy(true); setError(null);
    try {
      const body = { ...f, sortOrder: Number(f.sortOrder) || 0, productId: product.id };
      if (initial) await api(`/api/price-options/${initial.id}`, { method: 'PATCH', body });
      else await api('/api/price-options', { body });
      toast('Price saved. It applies to new sales only.');
      onSaved();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <Modal title={`${initial ? 'Edit' : 'New'} price — ${product.name}`} onClose={onClose} footer={<><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.label || !f.sellingPrice} onClick={save}>Save price</button></>}>
      <ErrorNote message={error} />
      <div className="row g-2">
        <div className="col-6"><Field label="Button label"><input className="form-control" value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="₱35" autoFocus /></Field></div>
        <div className="col-6"><Field label="Selling price (₱)"><input className="form-control" inputMode="decimal" value={f.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} /></Field></div>
        <div className="col-6"><Field label="Package type"><select className="form-select" value={f.packageType} onChange={(e) => { set('packageType', e.target.value); if (!f.sacksPerUnit) set('sacksPerUnit', pkgDefaults(e.target.value)); }}>{Object.entries(PACKAGE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
        <div className="col-6"><Field label="Unit / weight note"><input className="form-control" value={f.unitDescription} onChange={(e) => set('unitDescription', e.target.value)} /></Field></div>
        <div className="col-6"><Field label="Sacks per unit" hint="0.5 half, 1 full, N multiple. Empty for retail."><input className="form-control" inputMode="decimal" value={f.sacksPerUnit} onChange={(e) => set('sacksPerUnit', e.target.value)} /></Field></div>
        <div className="col-6"><Field label="Stock used per unit" hint="Only if you track stock. Empty = deduct nothing."><input className="form-control" inputMode="decimal" value={f.inventoryQuantityPerUnit} onChange={(e) => set('inventoryQuantityPerUnit', e.target.value)} /></Field></div>
        <div className="col-6"><Field label="Display order"><input type="number" className="form-control" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} /></Field></div>
        <div className="col-6 d-flex align-items-center"><div className="form-check form-switch"><input className="form-check-input" id="po-active" type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /><label className="form-check-label" htmlFor="po-active">Active (shown in POS)</label></div></div>
      </div>
    </Modal>
  );
}

function ProductForm({ initial, onClose, onSaved }: { initial?: Json; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: initial?.name ?? '', description: initial?.description ?? '', active: initial?.active ?? true, inventoryTrackingEnabled: initial?.inventoryTrackingEnabled ?? false, enforceStock: initial?.enforceStock ?? false, stockUnit: initial?.stockUnit ?? 'sack', lowStockThreshold: initial?.lowStockThreshold ? String(Number(initial.lowStockThreshold)) : '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true); setError(null);
    try {
      if (initial) await api(`/api/products/${initial.id}`, { method: 'PATCH', body: f }); else await api('/api/products', { body: f });
      toast('Product saved'); onSaved();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <Modal title={initial ? 'Edit product' : 'New product'} onClose={onClose} footer={<><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name} onClick={save}>Save product</button></>}>
      <ErrorNote message={error} />
      <Field label="Name"><input className="form-control" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Description"><input className="form-control" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <div className="form-check form-switch mb-2"><input className="form-check-input" id="p-active" type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /><label className="form-check-label" htmlFor="p-active">Active</label></div>
      <div className="form-check form-switch mb-2"><input className="form-check-input" id="p-track" type="checkbox" checked={f.inventoryTrackingEnabled} onChange={(e) => set('inventoryTrackingEnabled', e.target.checked)} /><label className="form-check-label" htmlFor="p-track">Track stock for this product</label></div>
      {f.inventoryTrackingEnabled && (
        <div className="ps-3 border-start">
          <div className="form-check form-switch mb-2"><input className="form-check-input" id="p-enf" type="checkbox" checked={f.enforceStock} onChange={(e) => set('enforceStock', e.target.checked)} /><label className="form-check-label" htmlFor="p-enf">Block sales that would make stock negative</label></div>
          <div className="row g-2"><div className="col-6"><Field label="Stock unit"><input className="form-control" value={f.stockUnit} onChange={(e) => set('stockUnit', e.target.value)} /></Field></div><div className="col-6"><Field label="Low-stock threshold"><input className="form-control" inputMode="decimal" value={f.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} /></Field></div></div>
        </div>
      )}
    </Modal>
  );
}

export default function ProductsPage() {
  const { data, loading, error, reload } = useFetch<Json[]>('/api/products?all=1');
  const [price, setPrice] = useState<{ product: Json; initial?: Json } | null>(null);
  const [prod, setProd] = useState<{ initial?: Json } | null>(null);
  const toast = useToast();

  async function toggle(o: Json) {
    try { await api(`/api/price-options/${o.id}`, { method: 'PATCH', body: { active: !o.active } }); reload(); } catch (e) { toast((e as Error).message, 'danger'); }
  }

  return (
    <div>
      <PageHeader title="Products & Pricing" subtitle="Price changes apply to future sales only. Past sales keep the price they were made at." actions={<button className="btn btn-primary" onClick={() => setProd({})}><Plus size={16} aria-hidden /> New product</button>} />
      <ErrorNote message={error} />
      {loading && !data ? <TableSkeleton /> : data?.length === 0 ? <EmptyState title="No products yet" /> : (
        <div className="d-grid gap-3">
          {data?.map((p) => (
            <div className="card" key={p.id}>
              <div className="card-header d-flex justify-content-between align-items-center">
                <span>{p.name} {!p.active && <StatusBadge status="CANCELLED" label="Inactive" />} {p.inventoryTrackingEnabled && <span className="pill info ms-1">Stock tracked</span>}</span>
                <div className="d-flex gap-2"><button className="btn btn-sm btn-outline-primary" onClick={() => setProd({ initial: p })}><Pencil size={14} aria-hidden /> Edit</button><button className="btn btn-sm btn-primary" onClick={() => setPrice({ product: p })}><Plus size={14} aria-hidden /> Add price</button></div>
              </div>
              {p.priceOptions.length === 0 ? <EmptyState title="No prices yet" text="Add a price button to sell this product." /> : (
                <div className="table-responsive"><table className="table mb-0 align-middle">
                  <thead><tr><th>Button</th><th>Package</th><th className="text-end">Price</th><th>Sacks / unit</th><th>Stock / unit</th><th>Order</th><th>Status</th><th /></tr></thead>
                  <tbody>{p.priceOptions.map((o: Json) => (
                    <tr key={o.id}><td className="fw-semibold">{o.label}</td><td>{PACKAGE_LABELS[o.packageType]}{o.unitDescription ? ` · ${o.unitDescription}` : ''}</td><td className="text-end money">{formatPeso(o.sellingPrice)}</td><td>{o.sacksPerUnit ? Number(o.sacksPerUnit) : '—'}</td><td>{o.inventoryQuantityPerUnit ? Number(o.inventoryQuantityPerUnit) : 'not set'}</td><td>{o.sortOrder}</td><td><StatusBadge status={o.active ? 'ACTIVE' : 'CANCELLED'} label={o.active ? 'Active' : 'Inactive'} /></td>
                      <td className="text-nowrap"><button className="btn btn-sm btn-outline-primary me-1" onClick={() => setPrice({ product: p, initial: o })}>Edit</button><button className="btn btn-sm btn-outline-secondary" onClick={() => toggle(o)}>{o.active ? 'Deactivate' : 'Activate'}</button></td></tr>
                  ))}</tbody></table></div>
              )}
            </div>
          ))}
        </div>
      )}
      {price && <PriceForm product={price.product} initial={price.initial} onClose={() => setPrice(null)} onSaved={() => { setPrice(null); reload(); }} />}
      {prod && <ProductForm initial={prod.initial} onClose={() => setProd(null)} onSaved={() => { setProd(null); reload(); }} />}
    </div>
  );
}
