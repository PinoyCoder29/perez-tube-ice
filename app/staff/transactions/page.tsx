'use client';
import { useState } from 'react';
import { useFetch, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { EmptyState, ErrorNote, Pager, StatusBadge, TableSkeleton } from '@/components/ui/common';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';

export default function StaffTransactions() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useFetch<Json>(`/api/sales?page=${page}&pageSize=20`, { pollMs: 30000 });
  return (
    <div>
      <h1 className="h5 fw-bold mb-3">Today&apos;s transactions</h1>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No sales yet today" /> : (
          <div className="table-responsive">
            <table className="table mb-0">
              <thead><tr><th>Time</th><th>Transaction</th><th>Customer</th><th>Items</th><th className="text-end">Total</th><th>Paid via</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data?.rows.map((s: Json) => (
                  <tr key={s.id} className={s.status === 'VOIDED' ? 'text-decoration-line-through text-muted' : ''}>
                    <td>{formatDateTime(s.createdAt)}</td><td>{s.transactionNumber}</td><td>{s.customer?.name ?? 'Walk-in'}</td>
                    <td>{s.items.map((i: Json) => `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`).join(', ')}</td>
                    <td className="text-end money">{formatPeso(s.totalAmount)}</td>
                    <td>{[...new Set(s.payments.filter((p: Json) => p.status === 'ACTIVE').map((p: Json) => PAYMENT_METHOD_LABELS[p.paymentMethod]))].join(', ') || 'Utang'}</td>
                    <td><StatusBadge status={s.status === 'VOIDED' ? 'VOIDED' : s.paymentStatus} /></td>
                    <td><a href={`/receipt/${s.id}`} target="_blank" rel="noreferrer">Receipt</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={page} total={data.total} pageSize={20} onPage={setPage} />}
      </div>
    </div>
  );
}
