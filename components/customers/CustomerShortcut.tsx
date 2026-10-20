'use client';
import { useState } from 'react';
import { MapPin, Phone } from 'lucide-react';
import { type Json } from '@/lib/client/api';
import { Modal } from '@/components/ui/Modal';
import { telHref } from '@/lib/phone';
import { DeliveryForm } from '@/components/deliveries/DeliveryForm';
import { CustomerDetail } from './CustomerDetail';

/**
 * Staff → Customers → tap a customer: details, this customer's price/package buttons and Confirm Delivery.
 * It embeds the SAME DeliveryForm as Staff → Deliveries, so both paths share one set of rules, one server endpoint
 * and one idempotency mechanism (no different totals, no duplicate deliveries).
 */
export function CustomerShortcut({ customer, onClose, onChanged }: { customer: Json; onClose: () => void; onChanged?: () => void }) {
  const [history, setHistory] = useState(false);
  return (
    <Modal title={customer.name} size="xl" onClose={onClose}>
      <div className="d-flex flex-wrap gap-2 justify-content-between mb-3">
        <div className="wrap-any">
          <a className="btn btn-outline-primary btn-sm mb-2" href={telHref(customer.phone)}><Phone size={14} aria-hidden /> Call {customer.phone}</a>
          <div><MapPin size={14} aria-hidden /> {customer.address}{customer.landmark ? ` (${customer.landmark})` : ''}</div>
        </div>
        <div><button className="btn btn-outline-secondary btn-sm" onClick={() => setHistory(true)}>History &amp; payments</button></div>
      </div>
      <DeliveryForm inline customer={customer} onClose={onClose} onSaved={() => { onChanged?.(); onClose(); }} />
      {history && <CustomerDetail id={customer.id} onClose={() => setHistory(false)} onChanged={onChanged} />}
    </Modal>
  );
}
