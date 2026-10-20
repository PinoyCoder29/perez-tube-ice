'use client';
import { useEffect, useMemo, useState } from 'react';
import { unitForQty } from '@/lib/pricing';
import { useOnline } from '@/lib/client/online';
import Link from 'next/link';
import { CheckCircle2, Minus, Plus, Printer, Trash2, Wallet, ReceiptText, CreditCard } from 'lucide-react';
import { api, newKey, useFetch, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso, formatQty } from '@/lib/formatting';
import { PACKAGE_LABELS, PAYMENT_METHOD_LABELS, DIGITAL_METHODS } from '@/lib/constants';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

interface Line { key: string; priceOptionId?: string; productId?: string; customPrice?: string; productName: string; label: string; unitCents: number; quantity: number }
type Mode = 'CASH' | 'DIGITAL' | 'CREDIT' | 'SPLIT';
const cents = (v: string | number) => Math.round((Number(v) || 0) * 100);
const peso = (c: number) => (c / 100).toFixed(2);

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return <span>{formatDateTime(now)}</span>;
}

export default function PosPage() {
  const toast = useToast();
  const products = useFetch<Json[]>('/api/products');
  const summary = useFetch<Json>('/api/staff/summary', { pollMs: 30000 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<Json | null>(null);
  const [mode, setMode] = useState<Mode>('CASH');
  const [digital, setDigital] = useState('GCASH');
  const [tendered, setTendered] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [paidMethod, setPaidMethod] = useState('CASH');
  const [splitCash, setSplitCash] = useState('');
  const [splitDigital, setSplitDigital] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => newKey());
  const [done, setDone] = useState<Json | null>(null);

  const cfg = useFetch<Json>('/api/settings');
  const [customOpen, setCustomOpen] = useState(false);
  const [customProduct, setCustomProduct] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const list = products.data ?? [];
  const active = list.find((p) => p.id === activeId) ?? list[0];
  const customProd = list.find((p) => p.id === (customProduct || active?.id));
  const maxCustom = Number(cfg.data?.customPriceMax ?? 5000);
  const customOk = /^\d{1,7}(\.\d{1,2})?$/.test(customPrice) && Number(customPrice) > 0 && Number(customPrice) <= maxCustom;
  function addCustom() {
    if (!customOk || !customProd) return;
    setDone(null);
    setCart((c) => [...c, { key: `custom-${Date.now()}-${c.length}`, productId: customProd.id, customPrice: Number(customPrice).toFixed(2), productName: customProd.name, label: `Custom ₱${Number(customPrice).toFixed(2)}`, unitCents: cents(customPrice), quantity: customQty }]);
    setCustomPrice(''); setCustomQty(1); setCustomOpen(false);
  }
  // Customer-specific prices: loaded when a customer is selected; the server re-prices on confirm.
  const [pricing, setPricing] = useState<Json[] | null>(null);
  const online = useOnline();
  useEffect(() => {
    if (!customer) { setPricing(null); return; }
    let live = true;
    api<Json[]>(`/api/customers/${customer.id}/pricing`).then((d) => live && setPricing(d)).catch(() => live && setPricing(null));
    return () => { live = false; };
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const optView = (id: string) => pricing?.flatMap((p) => p.options).find((o: Json) => o.id === id);
  const cartView = useMemo(
    () =>
      cart.map((l) => {
        const o = l.priceOptionId && pricing ? optView(l.priceOptionId) : null;
        if (!o) return { ...l, source: l.priceOptionId ? 'STANDARD' : 'CUSTOM', invalid: false };
        const r = unitForQty(o.standardPrice, o.tiers, l.quantity);
        return r ? { ...l, unitCents: cents(r.price), source: r.source as string, invalid: false } : { ...l, source: 'STANDARD', invalid: true };
      }),
    [cart, pricing], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const buttons: Json[] = active
    ? pricing
      ? (pricing.find((p) => p.id === active.id)?.options ?? [])
          .map((o: Json) => { const r = unitForQty(o.standardPrice, o.tiers, 1); return r ? { id: o.id, label: o.label, sellingPrice: r.price, packageType: o.packageType, unitDescription: o.unitDescription, source: r.source } : null; })
          .filter(Boolean)
      : active.priceOptions.map((o: Json) => ({ id: o.id, label: o.label, sellingPrice: o.sellingPrice, packageType: o.packageType, unitDescription: o.unitDescription, source: 'STANDARD' }))
    : [];
  const totalC = useMemo(() => cartView.reduce((a, l) => a + l.unitCents * l.quantity, 0), [cartView]);
  useEffect(() => {
    if (!cart.length) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [cart.length]);

  // Work out the payment lines for the chosen mode.
  const pay = useMemo(() => {
    let lines: { method: string; cents: number }[] = [];
    let problem: string | null = null;
    if (mode === 'CASH') lines = [{ method: 'CASH', cents: totalC }];
    else if (mode === 'DIGITAL') lines = [{ method: digital, cents: totalC }];
    else if (mode === 'CREDIT') {
      const c = cents(paidNow);
      if (c > totalC) problem = 'Amount paid is more than the total.';
      if (c > 0) lines = [{ method: paidMethod, cents: c }];
    } else {
      const a = cents(splitCash), b = cents(splitDigital);
      if (a + b > totalC) problem = 'Payments are more than the total.';
      if (a > 0) lines.push({ method: 'CASH', cents: a });
      if (b > 0) lines.push({ method: digital, cents: b });
    }
    const paid = lines.reduce((x, l) => x + l.cents, 0);
    const balance = totalC - paid;
    if (!problem && balance > 0 && !customer) problem = 'Select a customer — unpaid amounts are recorded as utang.';
    if (!problem && mode === 'CREDIT' && !customer) problem = 'Select a customer for credit.';
    if (!problem && cartView.some((l) => l.invalid)) problem = 'A price is not available for this customer. Remove that item or ask the Admin.';
    return { lines, paid, balance, problem };
  }, [mode, digital, paidNow, paidMethod, splitCash, splitDigital, totalC, customer, cartView]);

  function addPrice(p: Json, o: Json) {
    setDone(null);
    setCart((c) => {
      const i = c.findIndex((l) => l.key === o.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { key: o.id, priceOptionId: o.id, productName: p.name, label: o.label, unitCents: cents(o.sellingPrice), quantity: 1 }];
    });
  }
  const setQty = (id: string, d: number) => setCart((c) => c.map((l) => (l.key === id ? { ...l, quantity: Math.max(1, Math.min(1000, l.quantity + d)) } : l)));
  const remove = (id: string) => setCart((c) => c.filter((l) => l.key !== id));

  function reset() {
    setCart([]); setCustomer(null); setMode('CASH'); setTendered(''); setPaidNow(''); setSplitCash(''); setSplitDigital(''); setError(null); setKey(newKey());
  }

  async function confirm() {
    if (busy || cart.length === 0 || pay.problem) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Json>('/api/sales', {
        body: {
          idempotencyKey: key,
          customerId: customer?.id ?? null,
          items: cart.map((l) => (l.priceOptionId ? { priceOptionId: l.priceOptionId, quantity: l.quantity } : { productId: l.productId, customUnitPrice: l.customPrice, quantity: l.quantity })),
          payments: pay.lines.map((l) => ({ method: l.method, amount: peso(l.cents) })),
        },
      });
      const expected = peso(totalC);
      if (Number(r.sale.totalAmount).toFixed(2) !== expected) toast(`Prices were updated — the sale total is ${formatPeso(r.sale.totalAmount)}.`, 'info');
      setDone({ ...r.sale, previousBalance: customer?.outstandingBalance });
      reset();
      summary.reload();
      products.reload();
    } catch (e) {
      setError((e as Error).message); // key is kept, so a retry can never double-record
    } finally {
      setBusy(false);
    }
  }

  const change = mode === 'CASH' && cents(tendered) > totalC ? cents(tendered) - totalC : 0;
  const s = summary.data;

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div className="me-auto">
          <h1 className="h5 fw-bold mb-0">Staff POS</h1>
          <div className="small text-muted-2"><Clock /></div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          {[['Sales today', s ? formatPeso(s.totalSales) : '…'], ['Transactions', s ? s.transactions : '…'], ['Sacks sold', s ? formatQty(s.sacksSold) : '…']].map(([l, v]) => (
            <div key={l as string} className="card px-3 py-1"><div className="small text-muted-2">{l}</div><div className="fw-bold money">{v}</div></div>
          ))}
        </div>
      </div>
      <div className="d-flex gap-2 flex-wrap mb-3">
        <Link className="btn btn-outline-primary btn-sm" href="/staff/expenses"><Wallet size={14} aria-hidden /> Record expense</Link>
        <Link className="btn btn-outline-primary btn-sm" href="/staff/transactions"><ReceiptText size={14} aria-hidden /> Today&apos;s transactions</Link>
        <Link className="btn btn-outline-primary btn-sm" href="/staff/debts"><CreditCard size={14} aria-hidden /> Today&apos;s debts</Link>
      </div>

      {done && (
        <div className="alert alert-success d-flex flex-wrap align-items-center gap-3" role="status">
          <CheckCircle2 aria-hidden />
          <div className="me-auto">
            <strong>Sale {done.transactionNumber} saved — {formatPeso(done.totalAmount)}</strong>
            {Number(done.totalAmount) > Number(done.amountPaid) && <div className="small">Unpaid (utang): {formatPeso(Number(done.totalAmount) - Number(done.amountPaid))}</div>}
          </div>
          <a className="btn btn-sm btn-outline-success" href={`/receipt/${done.id}`} target="_blank" rel="noreferrer"><Printer size={14} aria-hidden /> Receipt</a>
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          {products.loading && !products.data ? <Spinner /> : <ErrorNote message={products.error} />}
          {list.length > 0 && (
            <>
              <div className="product-tabs mb-3" role="tablist">
                {list.map((p) => (
                  <button key={p.id} role="tab" aria-selected={p.id === active?.id} className={`product-tab ${p.id === active?.id ? 'active' : ''}`} onClick={() => setActiveId(p.id)}>{p.name}</button>
                ))}
              </div>
              {active && buttons.length === 0 && <EmptyState title="No price buttons yet" text="Ask the Admin to add prices for this product." />}
              <div className="price-grid">
                {buttons.map((o: Json) => (
                  <button key={o.id} className="price-btn" onClick={() => addPrice(active, o)} aria-label={`${active.name} ${o.label} ${formatPeso(o.sellingPrice)}`}>
                    {o.source === 'CUSTOMER' ? formatPeso(o.sellingPrice) : o.label}
                    <small>{o.source === 'CUSTOMER' ? `${o.label} · customer price` : o.packageType !== 'RETAIL' ? PACKAGE_LABELS[o.packageType] : o.unitDescription ?? ''}</small>
                  </button>
                ))}
              </div>
              {cfg.data?.allowStaffCustomPrice !== false && (
                <div className="mt-3">
                  <button className="btn btn-outline-primary" aria-expanded={customOpen} onClick={() => { setCustomOpen((x) => !x); setCustomProduct(active?.id ?? ''); }}>Custom price</button>
                  {customOpen && (
                    <div className="card mt-2"><div className="card-body">
                      <div className="row g-2 align-items-end">
                        <div className="col-12 col-sm-4"><label className="form-label small mb-1" htmlFor="cp-prod">Product</label><select id="cp-prod" className="form-select" value={customProduct || active?.id} onChange={(e) => setCustomProduct(e.target.value)}>{list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        <div className="col-6 col-sm-3"><label className="form-label small mb-1" htmlFor="cp-price">Price (₱)</label><input id="cp-price" className="form-control" inputMode="decimal" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} /></div>
                        <div className="col-6 col-sm-2"><label className="form-label small mb-1" htmlFor="cp-qty">Qty</label><input id="cp-qty" type="number" min={1} className="form-control" value={customQty} onChange={(e) => setCustomQty(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} /></div>
                        <div className="col-12 col-sm-3"><button className="btn btn-primary w-100" disabled={!customOk} onClick={addCustom}>Add to sale</button></div>
                      </div>
                      <div className="small mt-2 text-muted-2">{customPrice && !customOk ? <span className="text-danger">Enter a price above ₱0 and up to {formatPeso(maxCustom)}.</span> : customOk ? <>Unit {formatPeso(Number(customPrice))} × {customQty} = <strong>{formatPeso(Number(customPrice) * customQty)}</strong></> : 'Use this when no price button matches. It does not change the price buttons.'}</div>
                    </div></div>
                  )}
                </div>
              )}
            </>
          )}
          {!products.loading && list.length === 0 && !products.error && <EmptyState title="No products available" />}
        </div>

        <div className="col-12 col-lg-5">
          <div className="card">
            <div className="card-body">
              <div className="mb-3"><CustomerPicker value={customer} onChange={setCustomer} placeholder="Customer (optional for cash)…" />{customer && pricing && <div className="small text-muted-2 mt-1">Showing prices for {customer.name}: customer price where set, otherwise standard.</div>}</div>
              {cart.length === 0 ? <div className="text-muted-2 text-center py-3">Tap a price to start a sale.</div> : cartView.map((l) => (
                <div className="cart-line" key={l.key}>
                  <div className="flex-grow-1">
                    <div className="fw-semibold">{l.productName} — {l.label}</div>
                    <div className="small text-muted-2 money">{formatPeso(l.unitCents / 100)} × {l.quantity} = {formatPeso((l.unitCents * l.quantity) / 100)}{l.source === 'CUSTOMER' ? ' · customer price' : ''}{l.invalid ? ' · no price' : ''}</div>
                  </div>
                  <button className="qty-btn" aria-label="Decrease quantity" onClick={() => setQty(l.key, -1)}><Minus size={16} /></button>
                  <strong style={{ minWidth: 24, textAlign: 'center' }}>{l.quantity}</strong>
                  <button className="qty-btn" aria-label="Increase quantity" onClick={() => setQty(l.key, 1)}><Plus size={16} /></button>
                  <button className="qty-btn text-danger" aria-label="Remove item" onClick={() => remove(l.key)}><Trash2 size={16} /></button>
                </div>
              ))}
              <div className="d-flex justify-content-between align-items-center my-3">
                <span className="fw-semibold">Total</span>
                <span className="cart-total">{formatPeso(totalC / 100)}</span>
              </div>

              <div className="pay-modes mb-3" role="group" aria-label="Payment type">
                {([['CASH', 'Cash'], ['DIGITAL', 'GCash / digital'], ['CREDIT', 'Utang'], ['SPLIT', 'Split']] as [Mode, string][]).map(([m, l]) => (
                  <button key={m} className={`pay-mode ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>{l}</button>
                ))}
              </div>

              {mode === 'CASH' && (
                <div className="mb-3">
                  <label className="form-label small mb-1" htmlFor="tend">Cash received (optional, to compute change)</label>
                  <input id="tend" className="form-control" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} />
                  {change > 0 && <div className="mt-1 fw-semibold">Change: {formatPeso(change / 100)}</div>}
                </div>
              )}
              {(mode === 'DIGITAL' || mode === 'SPLIT') && (
                <div className="mb-3">
                  <label className="form-label small mb-1" htmlFor="dig">Digital method</label>
                  <select id="dig" className="form-select" value={digital} onChange={(e) => setDigital(e.target.value)}>
                    {DIGITAL_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                  </select>
                </div>
              )}
              {mode === 'SPLIT' && (
                <div className="row g-2 mb-3">
                  <div className="col-6"><label className="form-label small mb-1" htmlFor="sc">Cash (₱)</label><input id="sc" className="form-control" inputMode="decimal" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} /></div>
                  <div className="col-6"><label className="form-label small mb-1" htmlFor="sd">Digital (₱)</label><input id="sd" className="form-control" inputMode="decimal" value={splitDigital} onChange={(e) => setSplitDigital(e.target.value)} /></div>
                </div>
              )}
              {mode === 'CREDIT' && (
                <div className="mb-3">
                  <div className="row g-2">
                    <div className="col-6"><label className="form-label small mb-1" htmlFor="pn">Paid now (₱, optional)</label><input id="pn" className="form-control" inputMode="decimal" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} /></div>
                    <div className="col-6"><label className="form-label small mb-1" htmlFor="pm">Method</label>
                      <select id="pm" className="form-select" value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)}>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    </div>
                  </div>
                </div>
              )}

              {pay.balance > 0 && customer && cart.length > 0 && (
                <div className="small border rounded-3 p-2 mb-3 bg-light">
                  <div className="d-flex justify-content-between"><span>Previous balance</span><span className="money">{formatPeso(customer.outstandingBalance)}</span></div>
                  <div className="d-flex justify-content-between"><span>New purchase</span><span className="money">{formatPeso(totalC / 100)}</span></div>
                  <div className="d-flex justify-content-between"><span>Amount paid</span><span className="money">{formatPeso(pay.paid / 100)}</span></div>
                  <div className="d-flex justify-content-between fw-bold"><span>New balance</span><span className="money">{formatPeso(Number(customer.outstandingBalance) + pay.balance / 100)}</span></div>
                </div>
              )}

              {!online && <div className="alert alert-warning py-2 small" role="status">You are offline. Nothing can be saved until you reconnect — your cart is still here.</div>}
              <ErrorNote message={error} />
              {pay.problem && cart.length > 0 && <div className="text-danger small mb-2">{pay.problem}</div>}
              <div className="d-flex gap-2 sticky-confirm bg-white py-2">
                <button className="btn btn-light" disabled={cart.length === 0 || busy} onClick={() => { setCart([]); setError(null); }}>Clear</button>
                <button className="btn btn-success confirm-btn flex-grow-1" disabled={busy || !online || cart.length === 0 || !!pay.problem} onClick={confirm}>
                  {busy ? 'Saving…' : `Confirm Sale ${cart.length ? formatPeso(totalC / 100) : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
