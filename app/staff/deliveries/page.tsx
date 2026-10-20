'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DeliveryBoard } from '@/components/deliveries/DeliveryBoard';
import { CustomersTab } from '@/components/deliveries/CustomersTab';
import { DeliveryForm } from '@/components/deliveries/DeliveryForm';
import { CustomerDetail } from '@/components/customers/CustomerDetail';
import type { Json } from '@/lib/client/api';

// Page-level tabs (not global navigation). Staff manage delivery requests directly: no Admin assignment.
export default function StaffDeliveries() {
  const [tab, setTab] = useState<'customers' | 'orders'>('customers');
  const [creating, setCreating] = useState<{ customer: Json | null } | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3 flex-wrap">
        <div className="btn-group" role="tablist" aria-label="Deliveries">
          <button role="tab" aria-selected={tab === 'customers'} className={`btn ${tab === 'customers' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab('customers')}>All Customers</button>
          <button role="tab" aria-selected={tab === 'orders'} className={`btn ${tab === 'orders' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setTab('orders')}>Delivery Orders</button>
        </div>
        <button className="btn btn-success" onClick={() => setCreating({ customer: null })}><Plus size={16} aria-hidden /> Create Delivery</button>
      </div>
      {tab === 'customers' ? <CustomersTab refreshKey={version} onCreate={(c) => setCreating({ customer: c })} onDetails={setDetails} /> : <DeliveryBoard key={version} />}
      {creating && <DeliveryForm customer={creating.customer} onClose={() => setCreating(null)} onSaved={() => { setCreating(null); setTab('orders'); bump(); }} />}
      {details && <CustomerDetail id={details} onClose={() => setDetails(null)} onChanged={() => { bump(); }} />}
    </div>
  );
}
