'use client';
import { useParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { useFetch, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';

export default function Receipt() {
  const { id } = useParams<{ id: string }>();
  const sale = useFetch<Json>(`/api/sales/${id}`);
  const settings = useFetch<Json>('/api/settings');
  const s = sale.data;
  const st = settings.data;
  if (sale.error) return <div className="p-4 text-danger">{sale.error}</div>;
  if (!s) return <div className="p-4">Loading receipt…</div>;
  const balance = Number(s.totalAmount) - Number(s.amountPaid);
  return (
    <>
      <div className="no-print text-center mt-3"><button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print receipt</button></div>
      <div className="receipt">
        <div className="text-center">
          <strong style={{ fontSize: 16 }}>{st?.businessName ?? 'PEREZ ICE'}</strong>
          {st?.businessAddress && <div>{st.businessAddress}</div>}
          {st?.businessPhone && <div>{st.businessPhone}</div>}
        </div>
        <hr />
        <div>Ref: {s.transactionNumber}</div>
        <div>Date: {formatDateTime(s.createdAt)}</div>
        {s.customer && <div>Customer: {s.customer.name}</div>}
        {s.status === 'VOIDED' && <div><strong>*** VOIDED ***</strong></div>}
        <hr />
        {s.items.map((i: Json) => (
          <div key={i.id} className="mb-1">
            <div>{i.productNameSnapshot} {i.labelSnapshot}</div>
            <div className="d-flex justify-content-between"><span>{i.quantity} × {formatPeso(i.unitPrice)}</span><span>{formatPeso(i.lineTotal)}</span></div>
          </div>
        ))}
        {Number(s.deliveryFee) > 0 && <div className="d-flex justify-content-between"><span>Delivery fee</span><span>{formatPeso(s.deliveryFee)}</span></div>}
        <hr />
        <div className="d-flex justify-content-between"><strong>TOTAL</strong><strong>{formatPeso(s.totalAmount)}</strong></div>
        {s.payments.filter((p: Json) => p.status === 'ACTIVE' || s.status === 'VOIDED').map((p: Json) => (
          <div key={p.id} className="d-flex justify-content-between"><span>Paid ({PAYMENT_METHOD_LABELS[p.paymentMethod]})</span><span>{formatPeso(p.amount)}</span></div>
        ))}
        <div className="d-flex justify-content-between"><span>Amount paid</span><span>{formatPeso(s.amountPaid)}</span></div>
        {balance > 0 && s.status !== 'VOIDED' && <div className="d-flex justify-content-between"><strong>Balance (utang)</strong><strong>{formatPeso(balance)}</strong></div>}
        <hr />
        <div className="text-center">{st?.receiptFooter}</div>
      </div>
    </>
  );
}
