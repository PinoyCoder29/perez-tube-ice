'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MapPin, Phone, Plus, Trash2 } from 'lucide-react';
import { api, useFetch, type Json } from '@/lib/client/api';
import { formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { Modal } from '@/components/ui/Modal';
import { CustomerPicker } from '@/components/customers/CustomerPicker';
import { DeliveryBoard } from '@/components/deliveries/DeliveryBoard';
import { ErrorNote, ExportButtons, Field, PageHeader, TableSkeleton } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

interface Item { priceOptionId: string; quantity: number }

function ScheduleForm({ initialCustomerId, onClose, onSaved }: { initialCustomerId?: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const products = useFetch<Json[]>('/api/products');
  const init = useFetch<Json>(initialCustomerId ? `/api/customers/${initialCustomerId}` : null);
  const [picked, setPicked] = useState<Json | null>(null);
  const customer = picked ?? (init.data ? { ...init.data.customer, outstandingBalance: init.data.summary.outstandingBalance } : null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [productId, setProductId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [qty, setQty] = useState(1);
  const [fee, setFee] = useState('');
  const [paymentType, setPaymentType] = useState('COD');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prod = products.data?.find((p) => p.id === productId);
  const optionOf = (id: string) => products.data?.flatMap((p) => p.priceOptions.map((o: Json) => ({ ...o, productName: p.name }))).find((o) => o.id === id);
  const itemsTotal = items.reduce((a, i) => a + Number(optionOf(i.priceOptionId)?.sellingPrice ?? 0) * i.quantity, 0);

  async function save(assign: boolean) {
    setBusy(true); setError(null);
    try {
      await api('/api/deliveries', { body: { customerId: customer.id, scheduledDate: date, scheduledTime: time || null, items, deliveryFee: fee || undefined, paymentType, instructions: instructions || null, assign } });
      toast(assign ? 'Delivery assigned to Staff' : 'Delivery saved as pending');
      onSaved();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  const ready = customer && date && items.length > 0;
  return (
    <Modal title="Schedule delivery" size="lg" onClose={onClose} footer={<><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-outline-primary" disabled={busy || !ready} onClick={() => save(false)}>Save as pending</button><button className="btn btn-primary" disabled={busy || !ready} onClick={() => save(true)}>Assign to Staff</button></>}>
      <ErrorNote message={error} />
      <Field label="Customer"><CustomerPicker value={customer} onChange={setPicked} /></Field>
      {customer && <div className="small text-muted-2 mb-3"><Phone size={12} aria-hidden /> {customer.phone} · <MapPin size={12} aria-hidden /> {customer.address}</div>}
      <div className="row g-2">
        <div className="col-6"><Field label="Requested date"><input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
        <div className="col-6"><Field label="Time (optional)"><input type="time" className="form-control" value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
      </div>
      <div className="border rounded-3 p-3 mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-md-4"><label className="form-label small mb-1">Product</label><select className="form-select" value={productId} onChange={(e) => { setProductId(e.target.value); setOptionId(''); }}><option value="">Choose…</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="col-md-4"><label className="form-label small mb-1">Package / price</label><select className="form-select" value={optionId} onChange={(e) => setOptionId(e.target.value)} disabled={!prod}><option value="">Choose…</option>{prod?.priceOptions.map((o: Json) => <option key={o.id} value={o.id}>{o.label} — {formatPeso(o.sellingPrice)}</option>)}</select></div>
          <div className="col-6 col-md-2"><label className="form-label small mb-1">Qty</label><input type="number" min={1} className="form-control" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></div>
          <div className="col-6 col-md-2"><button className="btn btn-outline-primary w-100" disabled={!optionId} onClick={() => { setItems((x) => [...x, { priceOptionId: optionId, quantity: qty }]); setOptionId(''); setQty(1); }}><Plus size={14} aria-hidden /> Add</button></div>
        </div>
        {items.map((i, idx) => { const o = optionOf(i.priceOptionId); return (
          <div className="d-flex justify-content-between align-items-center mt-2" key={idx}><span>{i.quantity}× {o?.productName} {o?.label}</span><span className="money">{formatPeso(Number(o?.sellingPrice ?? 0) * i.quantity)} <button className="btn btn-sm text-danger" aria-label="Remove" onClick={() => setItems((x) => x.filter((_, j) => j !== idx))}><Trash2 size={14} /></button></span></div>
        ); })}
      </div>
      <div className="row g-2">
        <div className="col-6"><Field label="Delivery fee (₱, optional)"><input className="form-control" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field></div>
        <div className="col-6"><Field label="Payment type"><select className="form-select" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}><option value="COD">Pay on arrival</option><option value="CREDIT">Credit (utang)</option></select></Field></div>
      </div>
      <Field label="Instructions (optional)"><input className="form-control" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
      <div className="d-flex justify-content-between fw-bold"><span>Total to collect</span><span className="money">{formatPeso(itemsTotal + (Number(fee) || 0))}</span></div>
    </Modal>
  );
}

function Inner() {
  const sp = useSearchParams();
  const [scheduling, setScheduling] = useState(!!sp.get('customerId'));
  const [version, setVersion] = useState(0);
  return (
    <div>
      <PageHeader title="Deliveries" actions={<><ExportButtons type="deliveries" params={{ period: 'month' }} label="Export month" /><button className="btn btn-primary" onClick={() => setScheduling(true)}><Plus size={16} aria-hidden /> Schedule delivery</button></>} />
      <DeliveryBoard key={version} admin />
      {scheduling && <ScheduleForm initialCustomerId={sp.get('customerId')} onClose={() => setScheduling(false)} onSaved={() => { setScheduling(false); setVersion((v) => v + 1); }} />}
    </div>
  );
}

export default function AdminDeliveries() {
  return <Suspense fallback={<TableSkeleton />}><Inner /></Suspense>;
}
