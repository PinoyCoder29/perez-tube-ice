'use client';
import { useState } from 'react';
import { useFetch, qs, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { EmptyState, ErrorNote, PageHeader, Pager, PeriodPicker, TableSkeleton, periodReady, usePeriod } from '@/components/ui/common';

export default function ActivityPage() {
  const [p, setP] = usePeriod('today');
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const { data, loading, error } = useFetch<Json>(periodReady(p) ? `/api/activity${qs({ ...p, entityType: entity, page })}` : null);
  return (
    <div>
      <PageHeader title="Staff Activity" subtitle="Audit trail of sales, payments, expenses, voids and price changes." actions={<PeriodPicker value={p} onChange={(v) => { setP(v); setPage(1); }} />} />
      {data?.note && <div className="alert alert-info py-2 small">{data.note}</div>}
      <ErrorNote message={error} />
      <div className="card mb-4">
        <div className="card-header">Activity by user</div>
        {data?.byUser.length === 0 ? <EmptyState title="No activity in this period" /> : (
          <div className="table-responsive"><table className="table mb-0"><thead><tr><th>User</th><th className="text-end">Sales</th><th className="text-end">Sales total</th><th className="text-end">Payments</th><th className="text-end">Collected</th><th className="text-end">Expenses</th><th className="text-end">Expense total</th></tr></thead>
            <tbody>{data?.byUser.map((u: Json) => <tr key={u.userId}><td>{u.name}</td><td className="text-end">{u.sales}</td><td className="text-end money">{formatPeso(u.salesTotal)}</td><td className="text-end">{u.payments}</td><td className="text-end money">{formatPeso(u.paymentsTotal)}</td><td className="text-end">{u.expenses}</td><td className="text-end money">{formatPeso(u.expensesTotal)}</td></tr>)}</tbody></table></div>
        )}
      </div>
      <div className="d-flex gap-2 mb-2"><select className="form-select" style={{ maxWidth: 220 }} aria-label="Entity" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}><option value="">All records</option>{['Sale', 'Payment', 'Expense', 'Delivery', 'Customer', 'Product', 'PriceOption', 'LedgerEntry', 'Setting', 'User'].map((x) => <option key={x}>{x}</option>)}</select></div>
      <div className="card">
        <div className="card-header">Audit log</div>
        {loading && !data ? <TableSkeleton /> : data?.logs.length === 0 ? <EmptyState title="No audit entries" /> : (
          <div className="table-responsive"><table className="table table-sm mb-0"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
            <tbody>{data?.logs.map((l: Json) => <tr key={l.id}><td className="text-nowrap">{formatDateTime(l.createdAt)}</td><td>{l.actor?.name ?? 'system'}</td><td><code>{l.action}</code></td><td>{l.entityType}</td><td className="small text-muted-2" style={{ maxWidth: 420, wordBreak: 'break-word' }}>{l.newValues ? JSON.stringify(l.newValues).slice(0, 200) : ''}</td></tr>)}</tbody></table></div>
        )}
        {data && <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
      </div>
    </div>
  );
}
