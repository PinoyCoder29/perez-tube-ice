'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Phone, Plus, Trash2 } from 'lucide-react';
import { api, newKey, useFetch, type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { ErrorNote, Field, StatusBadge } from '@/components/ui/common';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { useToast } from '@/components/ui/providers';
import { useOnline } from '@/lib/client/online';
import { unitForQty } from '@/lib/pricing';
import { businessDate, formatDate, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { DELIVERY_STATUS_LABELS, PACKAGE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/lib/constants';

interface Line { key: string; optionId?: string; productId: string; productName: string; label: string; packageType: string; qty: number; customPrice?: string }
type Arrangement = 'UTANG' | 'LATER' | 'CASH' | 'GCASH' | 'PARTIAL';
const c100 = (v: string | number) => Math.round((Number(v) || 0) * 100);

/**
 * Create a delivery order for a customer. Staff and Admin use the same form (no assignment step).
 * Prices shown are a preview from the customer's pricing; the server re-prices every line when the order is confirmed.
 */
export function DeliveryForm({ customer: initial, admin, inline, onClose, onSaved }: { customer?: Json | null; admin?: boolean; inline?: boolean; onClose: () => void; onSaved: (delivery?: Json) => void }) {
  const toast = useToast();
  const online = useOnline();
  const orderKey = useRef(newKey());
  const payKey = useRef(newKey());
  const [customer, setCustomer] = useState<Json | null>(initial ?? null);
  const acct = useFetch<Json>(customer ? `/api/customers/${customer.id}` : null);
  const pricing = useFetch<Json[]>(customer ? `/api/customers/${customer.id}/pricing` : null);
  const cfg = useFetch<Json>('/api/settings');
  const [productId, setProductId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [address, setAddress] = useState('');
  const [fee, setFee] = useState('');
  const [instructions, setInstructions] = useState('');
  const [date, setDate] = useState(() => businessDate(0));
  const [time, setTime] = useState('');
  const [arr, setArr] = useState<Arrangement>('LATER');
  const [partial, setPartial] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [cp, setCp] = useState({ price: '', qty: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Json | null>(null);

  const c = acct.data?.customer ?? customer;
  useEffect(() => { if (c) setAddress(c.landmark ? `${c.address} (${c.landmark})` : c.address); }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const products: Json[] = pricing.data ?? [];
  const activeProduct = products.find((p) => p.id === productId) ?? products[0];
  const maxCustom = Number(cfg.data?.customPriceMax ?? 5000);
  const optionOf = (id?: string) => products.flatMap((p) => p.options).find((o: Json) => o.id === id);

  const view = useMemo(
    () =>
      lines.map((l) => {
        if (l.customPrice) return { ...l, unit: c100(l.customPrice), source: 'CUSTOM', ok: true };
        const o = optionOf(l.optionId);
        const r = o ? unitForQty(o.standardPrice, o.tiers, l.qty) : null;
        return { ...l, unit: r ? c100(r.price) : 0, source: r?.source ?? 'NONE', ok: !!r };
      }),
    [lines, pricing.data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const itemsC = view.reduce((a, l) => a + l.unit * l.qty, 0);
  const totalC = itemsC + c100(fee);
  const allOk = view.every((l) => l.ok);
  const productSubtotals = view.reduce<Record<string, number>>((acc, l) => { acc[l.productName] = (acc[l.productName] ?? 0) + l.unit * l.qty; return acc; }, {});

  function addOption(p: Json, o: Json) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.optionId === o.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: o.id, optionId: o.id, productId: p.id, productName: p.name, label: o.label, packageType: o.packageType, qty: 1 }];
    });
  }
  const setQty = (key: string, n: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(1000, n)) } : l)));
  const bump = (key: string, d: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.min(1000, l.qty + d)) } : l)));
  const customOk = /^\d{1,7}(\.\d{1,2})?$/.test(cp.price) && Number(cp.price) > 0 && Number(cp.price) <= maxCustom;
  function addCustom() {
    if (!customOk || !activeProduct) return;
    setLines((ls) => [...ls, { key: `c-${Date.now()}-${ls.length}`, productId: activeProduct.id, productName: activeProduct.name, label: `Custom ₱${Number(cp.price).toFixed(2)}`, packageType: 'CUSTOM', qty: cp.qty, customPrice: Number(cp.price).toFixed(2) }]);
    setCp({ price: '', qty: 1 });
  }

  const payAmount = arr === 'CASH' || arr === 'GCASH' ? totalC : arr === 'PARTIAL' ? c100(partial) : 0;
  const payMethod = arr === 'CASH' ? 'CASH' : arr === 'GCASH' ? 'GCASH' : method;
  const payInvalid = (arr === 'PARTIAL' && (payAmount <= 0 || payAmount >= totalC)) || ((arr === 'CASH' || arr === 'GCASH') && totalC <= 0);
  const canSave = !!customer && lines.length > 0 && allOk && !payInvalid && !busy && online && !!date;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payment = payAmount > 0 ? { idempotencyKey: payKey.current, method: payMethod, amount: (payAmount / 100).toFixed(2), reference: payMethod === 'GCASH' && reference ? reference : null, notes: note || null } : null;
      const res = await api<Json>('/api/deliveries', {
        body: {
          idempotencyKey: orderKey.current,
          customerId: customer!.id,
          scheduledDate: date,
          scheduledTime: time || null,
          items: lines.map((l) => (l.customPrice ? { productId: l.productId, customUnitPrice: l.customPrice, quantity: l.qty } : { priceOptionId: l.optionId, quantity: l.qty })),
          deliveryFee: fee || undefined,
          paymentType: arr === 'UTANG' ? 'CREDIT' : 'COD',
          instructions: instructions || null,
          deliveryAddress: address || null,
          payment,
        },
      });
      toast(res.duplicate ? 'This delivery was already saved' : 'Delivery confirmed and saved');
      setSaved(res.delivery);
    } catch (e) {
      setError((e as Error).message); // keys are kept: retrying cannot create a second order or payment
      setBusy(false);
    }
  }

  const s = acct.data?.summary;
  const unpaid = (acct.data?.sales ?? []).filter((x: Json) => x.status === 'COMPLETED' && x.paymentStatus !== 'PAID');
  const arrs: [Arrangement, string][] = [['LATER', 'Collect later'], ['UTANG', 'Unpaid / Utang'], ['CASH', 'Paid — Cash'], ['GCASH', 'Paid — GCash'], ['PARTIAL', 'Partially paid']];

  const footerNode = (
        <>
          <div className="me-auto fw-bold">Total <span className="money fs-5">{formatPeso(totalC / 100)}</span></div>
          <button className="btn btn-light" onClick={onClose}>Close</button>
          <button className="btn btn-success btn-lg" disabled={!canSave} onClick={save}>{busy ? 'Saving…' : 'Confirm Delivery'}</button>
        </>
  );

  const body = (
    <>
      <ErrorNote message={error} />
      {!online && <div className="alert alert-warning py-2 small">You are offline. The order can’t be saved until you reconnect.</div>}
      {!customer ? (
        <Field label="Customer"><CustomerPicker value={customer} onChange={setCustomer} allowCreate={!!admin} placeholder="Search customer by name, number or address…" /></Field>
      ) : (
        <div className="card bg-light mb-3"><div className="card-body py-2">
          <div className="d-flex flex-wrap justify-content-between gap-2">
            <div><div className="fw-bold">{customer.name}</div><a className="btn btn-sm btn-outline-primary mt-1" href={telHref(customer.phone)}><Phone size={13} aria-hidden /> {customer.phone}</a></div>
            <div className="text-end">
              <div className="small text-muted-2">Outstanding debt</div>
              <div className={`fw-bold money ${s && Number(s.outstandingBalance) > 0 ? 'text-danger' : ''}`}>{s ? formatPeso(s.outstandingBalance) : '…'}</div>
              {!initial && <button className="btn btn-link btn-sm p-0" onClick={() => { setCustomer(null); setLines([]); }}>Change customer</button>}
            </div>
          </div>
          {s && <div className="row g-2 small mt-1 text-center">
            <div className="col-4"><div className="text-muted-2">Debt payments</div><div className="money">{formatPeso(s.debtPayments)}</div></div>
            <div className="col-4"><div className="text-muted-2">Cash collected</div><div className="money">{formatPeso(s.cashCollected)}</div></div>
            <div className="col-4"><div className="text-muted-2">GCash collected</div><div className="money">{formatPeso(s.gcashCollected)}</div></div>
          </div>}
          {unpaid.length > 0 && <div className="small mt-2"><strong>Unpaid / part-paid:</strong> {unpaid.slice(0, 3).map((x: Json) => `${x.transactionNumber} ${formatPeso(Number(x.totalAmount) - Number(x.amountPaid))} (${PAYMENT_STATUS_LABELS[x.paymentStatus]})`).join(' · ')}{unpaid.length > 3 ? ` · +${unpaid.length - 3} more` : ''}</div>}
          {acct.data?.payments?.filter((p: Json) => p.status === 'ACTIVE').length > 0 && <div className="small text-muted-2">Latest payments: {acct.data.payments.filter((p: Json) => p.status === 'ACTIVE').slice(0, 3).map((p: Json) => `${formatDate(p.createdAt)} ${PAYMENT_METHOD_LABELS[p.paymentMethod]} ${formatPeso(p.amount)}`).join(' · ')}</div>}
        </div></div>
      )}

      {customer && (
        <>
          <h3 className="h6">Products &amp; packages</h3>
          <div className="product-tabs mb-2" role="tablist">
            {products.map((p) => <button key={p.id} role="tab" aria-selected={p.id === activeProduct?.id} className={`product-tab ${p.id === activeProduct?.id ? 'active' : ''}`} style={{ padding: '.6rem' }} onClick={() => setProductId(p.id)}>{p.name}</button>)}
          </div>
          {pricing.loading && !pricing.data && <div className="text-muted-2 small">Loading this customer’s prices…</div>}
          {activeProduct && activeProduct.options.length === 0 && <div className="text-muted-2 small mb-2">No packages are priced for {activeProduct.name}. Ask the Admin to set a price, or use a custom price.</div>}
          <div className="row g-2 mb-3">
            {activeProduct?.options.map((o: Json) => {
              const r1 = unitForQty(o.standardPrice, o.tiers, 1);
              const r = r1 ?? { price: o.tiers[0]?.price, source: 'CUSTOMER' as const };
              return (
                <div className="col-6 col-md-4" key={o.id}>
                  <button type="button" className="btn btn-outline-primary w-100 text-start p-2 h-100" onClick={() => addOption(activeProduct, o)}>
                    <div className="fw-bold">{o.label}</div>
                    <div className="small">{PACKAGE_LABELS[o.packageType]}{o.packageType !== 'CUSTOM' && o.sacksPerUnit ? ` · ${Number(o.sacksPerUnit)} sack` : ''}</div>
                    <div className="money fw-bold">{formatPeso(r.price)}{!r1 && ` (from ${o.tiers[0]?.minQuantity}+)`}</div>
                    <div className="small"><StatusBadge status={r.source === 'CUSTOMER' ? 'ASSIGNED' : 'CANCELLED'} label={r.source === 'CUSTOMER' ? 'Customer price' : 'Standard price'} /></div>
                    {o.tiers.filter((t: Json) => t.minQuantity > 1).map((t: Json) => <div className="small" key={t.id}>{t.minQuantity}+ → {formatPeso(t.price)} each</div>)}
                  </button>
                </div>
              );
            })}
          </div>
          {cfg.data?.allowStaffCustomPrice !== false && (
            <details className="mb-3"><summary className="small fw-semibold">Custom price (when no package price fits)</summary>
              <div className="row g-2 align-items-end mt-1">
                <div className="col-5"><label className="form-label small mb-1" htmlFor="dc-price">Price (₱) for {activeProduct?.name}</label><input id="dc-price" className="form-control" inputMode="decimal" value={cp.price} onChange={(e) => setCp({ ...cp, price: e.target.value })} /></div>
                <div className="col-3"><label className="form-label small mb-1" htmlFor="dc-qty">Qty</label><input id="dc-qty" type="number" min={1} className="form-control" value={cp.qty} onChange={(e) => setCp({ ...cp, qty: Math.max(1, Number(e.target.value) || 1) })} /></div>
                <div className="col-4"><button className="btn btn-outline-primary w-100" disabled={!customOk} onClick={addCustom}>Add</button></div>
              </div>
              {cp.price && !customOk && <div className="small text-danger mt-1">Price must be above ₱0 and up to {formatPeso(maxCustom)}.</div>}
            </details>
          )}

          <h3 className="h6">Order</h3>
          {view.length === 0 ? <div className="text-muted-2 small mb-3">Tap a package above to add it. You can mix Tube Ice and Crushed Ice, half and full sacks.</div> : (
            <div className="mb-3">
              {view.map((l) => (
                <div className="cart-line flex-wrap" key={l.key}>
                  <div className="flex-grow-1 wrap-any">
                    <div className="fw-semibold">{l.productName} — {l.label}</div>
                    <div className="small text-muted-2 money">{l.ok ? `${formatPeso(l.unit / 100)} × ${l.qty} = ${formatPeso((l.unit * l.qty) / 100)}` : 'No valid price for this quantity'} · {l.source === 'CUSTOMER' ? 'Customer price' : l.source === 'CUSTOM' ? 'Custom price' : l.source === 'STANDARD' ? 'Standard price' : 'No price'}</div>
                  </div>
                  <button className="qty-btn" aria-label="Decrease quantity" onClick={() => bump(l.key, -1)}><Minus size={16} /></button>
                  <strong style={{ minWidth: 24, textAlign: 'center' }}>{l.qty}</strong>
                  <button className="qty-btn" aria-label="Increase quantity" onClick={() => bump(l.key, 1)}><Plus size={16} /></button>
                  <button className="qty-btn text-danger" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 size={16} /></button>
                  <div className="w-100 d-flex gap-1 flex-wrap pb-1" role="group" aria-label="Quick quantity">
                    {[1, 2, 3, 5, 10].map((n) => <button key={n} type="button" className={`btn btn-sm ${l.qty === n ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setQty(l.key, n)}>{n}</button>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view.length > 0 && (
            <div className="border rounded-3 p-2 mb-3 bg-light" aria-label="Order summary">
              <div className="fw-semibold mb-1">Order summary</div>
              {view.map((l) => <div className="d-flex justify-content-between small" key={l.key}><span>{l.qty} × {l.productName} {l.label}{l.ok ? ` @ ${formatPeso(l.unit / 100)}` : ''}</span><span className="money">{l.ok ? formatPeso((l.unit * l.qty) / 100) : '—'}</span></div>)}
              {Object.entries(productSubtotals).map(([n, v]) => <div className="d-flex justify-content-between small text-muted-2" key={n}><span>{n} subtotal</span><span className="money">{formatPeso(v / 100)}</span></div>)}
              {c100(fee) > 0 && <div className="d-flex justify-content-between small"><span>Delivery fee</span><span className="money">{formatPeso(c100(fee) / 100)}</span></div>}
              <hr className="my-1" /><div className="d-flex justify-content-between fw-bold"><span>Grand total</span><span className="money">{formatPeso(totalC / 100)}</span></div>
            </div>
          )}

          <div className="row g-2">
            <div className="col-12"><Field label="Delivery address for this order" hint="Only this order changes — the customer’s saved address stays as is."><input className="form-control" value={address} onChange={(e) => setAddress(e.target.value)} /></Field></div>
            <div className="col-6"><Field label="Requested date"><input type="date" className="form-control" min={businessDate(0)} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
            <div className="col-6"><Field label="Time (optional)"><input type="time" className="form-control" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
            <div className="col-6"><Field label="Delivery fee (₱, optional)"><input className="form-control" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field></div>
            <div className="col-6"><Field label="Instructions (optional)"><input className="form-control" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field></div>
          </div>

          <h3 className="h6">Payment arrangement</h3>
          <div className="tab-scroll mb-2" role="group" aria-label="Payment arrangement">
            {arrs.map(([k, l]) => <button key={k} type="button" className={`btn btn-sm ${arr === k ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setArr(k)}>{l}</button>)}
          </div>
          {(arr === 'CASH' || arr === 'GCASH') && <div className="small mb-2">{formatPeso(totalC / 100)} will be recorded as received by {arr === 'CASH' ? 'Cash' : 'GCash'}.</div>}
          {arr === 'PARTIAL' && (
            <div className="row g-2 mb-2">
              <div className="col-6"><label className="form-label small mb-1" htmlFor="df-amt">Amount received (₱)</label><input id="df-amt" className="form-control" inputMode="decimal" value={partial} onChange={(e) => setPartial(e.target.value)} /></div>
              <div className="col-6"><label className="form-label small mb-1" htmlFor="df-m">Paid with</label><select id="df-m" className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option></select></div>
              {payAmount > 0 && payAmount < totalC && <div className="col-12 small">Remaining after this payment: <strong>{formatPeso((totalC - payAmount) / 100)}</strong></div>}
              {payAmount >= totalC && totalC > 0 && <div className="col-12 small text-danger">That covers the whole order — use Paid — Cash or GCash.</div>}
            </div>
          )}
          {payMethod === 'GCASH' && payAmount > 0 && <Field label="GCash reference no. (optional)"><input className="form-control" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
          {payAmount > 0 && <Field label="Payment note (optional)"><input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
          {payAmount === 0 && <div className="small text-muted-2">Nothing is recorded as paid yet. {arr === 'UTANG' ? 'The full amount becomes utang once the order is delivered.' : 'Payments can be recorded later from the order.'}</div>}
        </>
      )}
    </>
  );

  if (saved) {
    const done = (
      <div>
        <div className="alert alert-success" role="status"><strong>Delivery {saved.orderNumber} confirmed and saved.</strong> It now shows in Deliveries, in the customer’s history and in Admin monitoring.</div>
        <div className="fw-semibold">{saved.customer.name}</div>
        <div className="small text-muted-2 wrap-any mb-2">{saved.addressSnapshot}</div>
        <ul className="small ps-3">{saved.items.map((i: Json) => <li key={i.id}>{i.quantity} × {i.productNameSnapshot} {i.labelSnapshot} @ {formatPeso(i.unitPrice)} = {formatPeso(i.lineTotal)} <span className="text-muted-2">({i.pricingSource === 'CUSTOMER' ? 'customer price' : i.pricingSource === 'CUSTOM' ? 'custom price' : 'standard price'})</span></li>)}</ul>
        <div className="row g-2 text-center mb-3">
          <div className="col-4"><div className="small text-muted-2">Order total</div><div className="fw-bold money">{formatPeso(saved.orderTotal)}</div></div>
          <div className="col-4"><div className="small text-muted-2">Paid</div><div className="fw-bold money">{formatPeso(saved.amountPaid)}</div></div>
          <div className="col-4"><div className="small text-muted-2">Remaining</div><div className="fw-bold money">{formatPeso(saved.amountDue)}</div></div>
        </div>
        <div className="d-flex gap-2 flex-wrap mb-3"><StatusBadge status={saved.status} label={DELIVERY_STATUS_LABELS[saved.status]} /><StatusBadge status={saved.paymentStatus} label={PAYMENT_STATUS_LABELS[saved.paymentStatus]} /></div>
        <button className="btn btn-primary btn-lg w-100" onClick={() => onSaved(saved)}>Done</button>
      </div>
    );
    return inline ? done : <Modal title="Delivery confirmed" onClose={() => onSaved(saved)}>{done}</Modal>;
  }
  if (inline) return <div>{body}<div className="sticky-confirm bg-white border-top pt-2 d-flex align-items-center gap-2 flex-wrap">{footerNode}</div></div>;
  return <Modal title="Create delivery order" size="xl" onClose={onClose} footer={footerNode}>{body}</Modal>;
}
