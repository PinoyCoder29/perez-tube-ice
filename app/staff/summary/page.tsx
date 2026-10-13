'use client';
import { useFetch } from '@/lib/client/api';
import { formatPeso, formatQty } from '@/lib/formatting';
import { ErrorNote, Skeleton } from '@/components/ui/common';

export default function StaffSummary() {
  const { data: s, error } = useFetch<Record<string, number>>('/api/staff/summary', { pollMs: 30000 });
  const rows: [string, string | number | undefined, string?][] = [
    ['Total sales today', s && formatPeso(s.totalSales)],
    ['Transactions', s?.transactions],
    ['Cash & digital collected', s && formatPeso(s.cashCollections), 'Includes payments on old utang'],
    ['New credit (utang) given', s && formatPeso(s.creditSales)],
    ['Debt payments received', s && formatPeso(s.debtCollections)],
    ['Expenses recorded', s && formatPeso(s.expenses)],
    ['Net cash flow', s && formatPeso(s.netCashFlow), 'Collected minus expenses'],
    ['Sacks sold', s && formatQty(s.sacksSold)],
    ['Total outstanding utang', s && formatPeso(s.outstandingDebt)],
  ];
  return (
    <div>
      <h1 className="h5 fw-bold mb-3">Today&apos;s summary</h1>
      <ErrorNote message={error} />
      <div className="row g-3">
        {rows.map(([l, v, hint]) => (
          <div className="col-6 col-lg-4" key={l}>
            <div className="card kpi"><div className="kpi-label">{l}</div>{v === undefined ? <Skeleton h={28} w="60%" /> : <div className="kpi-value">{v}</div>}{hint && <div className="small text-muted-2">{hint}</div>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
