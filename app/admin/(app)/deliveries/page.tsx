'use client';
import { DeliveryBoard } from '@/components/deliveries/DeliveryBoard';
import { ExportButtons, PageHeader } from '@/components/ui/common';

// Admin MONITORS deliveries. Staff choose the customer and create/process the order; Admin does not assign customers to Staff.
export default function AdminDeliveries() {
  return (
    <div>
      <PageHeader title="Deliveries" subtitle="Monitoring: every delivery order created by Staff, with prices used, payment status and history. Pick a date to see that day." actions={<ExportButtons type="deliveries" params={{ period: 'month' }} label="Export month" />} />
      <DeliveryBoard admin />
    </div>
  );
}
