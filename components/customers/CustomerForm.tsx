'use client';
import { useState } from 'react';
import { api, useFetch, type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote, Field } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';
import { formatPeso } from '@/lib/formatting';
import { PACKAGE_LABELS } from '@/lib/constants';

/**
 * Admin-only form. For a NEW customer it also sets the prices offered to that customer for every product/package
 * (leave a price blank to not set a customer price for that package). Saved together, then visible to Staff right away.
 */
export function CustomerForm({ initial, onClose, onSaved }: { initial?: Json; admin?: boolean; onClose: () => void; onSaved: (c: Json) => void }) {
  const toast = useToast();
  const products = useFetch<Json[]>(initial ? null : '/api/products?all=1');
  const [f, setF] = useState({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    address: initial?.address ?? '',
    landmark: initial?.landmark ?? '',
    notes: initial?.notes ?? '',
    active: initial?.active ?? true,
  });
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const bad = Object.values(prices).some((v) => v !== '' && !(/^\d{1,7}(\.\d{1,2})?$/.test(v) && Number(v) > 0));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const priceList = Object.entries(prices).filter(([, v]) => v !== '').map(([priceOptionId, sellingPrice]) => ({ priceOptionId, sellingPrice, minQuantity: 1 }));
      const c = initial
        ? await api(`/api/customers/${initial.id}`, { method: 'PATCH', body: f })
        : await api('/api/customers', { body: { ...f, prices: priceList } });
      toast(initial ? 'Customer updated' : `Customer added with ${priceList.length} price${priceList.length === 1 ? '' : 's'} — Staff can use them now`);
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
      size={initial ? 'md' : 'xl'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-light" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || bad || !f.name || !f.phone || !f.address} onClick={save}>{busy ? 'Saving…' : 'Save customer'}</button>
        </>
      }
    >
      <ErrorNote message={error} />
      <div className="row g-2">
        <div className="col-12 col-md-6"><Field label="Full name"><input className="form-control" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field></div>
        <div className="col-12 col-md-6"><Field label="Contact number" hint="09XXXXXXXXX or +639XXXXXXXXX"><input className="form-control" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field></div>
        <div className="col-12 col-md-8"><Field label="Address / location"><input className="form-control" value={f.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
        <div className="col-12 col-md-4"><Field label="Landmark (optional)"><input className="form-control" value={f.landmark} onChange={(e) => set('landmark', e.target.value)} /></Field></div>
        <div className="col-12"><Field label="Notes (optional)"><textarea className="form-control" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>
      </div>
      {initial && (
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" id="cust-active" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          <label className="form-check-label" htmlFor="cust-active">Active customer</label>
          <div className="form-text">Customer prices are edited in the customer’s details (Customer pricing).</div>
        </div>
      )}

      {!initial && (
        <>
          <h3 className="h6 mt-3">Prices for this customer</h3>
          <p className="small text-muted-2">Enter the price for each product and package this customer buys (½ sack, 1 sack, 2 sacks, 5 sacks…). Each customer can have different prices. Leave a box empty to give no customer price for that package. A package with no customer price uses its standard price, if one is set under Products &amp; Pricing. No price is ever guessed — a half sack is not assumed to be half of a full sack.</p>
          {products.loading && !products.data && <div className="small text-muted-2">Loading packages…</div>}
          {products.data?.length === 0 && <div className="small text-muted-2">No products yet.</div>}
          {products.data?.map((p) => (
            <div className="card mb-2" key={p.id}>
              <div className="card-header py-2">{p.name}</div>
              {p.priceOptions.length === 0 ? <div className="p-3 small text-muted-2">No packages configured for {p.name}. Add them in Products &amp; Pricing first.</div> : (
                <div className="p-2"><div className="row g-2">
                  {p.priceOptions.map((o: Json) => (
                    <div className="col-12 col-md-6 col-xl-4" key={o.id}>
                      <label className="d-block border rounded-3 p-2 h-100">
                        <span className="fw-semibold">{o.label}</span> <span className="small text-muted-2">{PACKAGE_LABELS[o.packageType]}{o.sacksPerUnit ? ` · ${Number(o.sacksPerUnit)} sack` : ''}</span>
                        <span className="d-block small text-muted-2">Standard: {o.active ? formatPeso(o.sellingPrice) : 'none'}</span>
                        <input className="form-control mt-1" inputMode="decimal" placeholder="Customer price ₱" aria-label={`${p.name} ${o.label} customer price`} value={prices[o.id] ?? ''} onChange={(e) => setPrices((x) => ({ ...x, [o.id]: e.target.value }))} />
                      </label>
                    </div>
                  ))}
                </div></div>
              )}
            </div>
          ))}
          {bad && <div className="text-danger small">Prices must be above ₱0 with at most 2 decimals.</div>}
        </>
      )}
    </Modal>
  );
}
