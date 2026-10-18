'use client';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch, type Json } from '@/lib/client/api';
import { businessDate, formatDateTime, formatPeso, formatQty } from '@/lib/formatting';
import { DELIVERY_STATUS_LABELS, PAYMENT_METHOD_LABELS, STAFF_HISTORY_DAYS } from '@/lib/constants';
import { CardTable, DayPicker, EmptyState, ErrorNote, ExportButtons, Skeleton, StatusBadge } from '@/components/ui/common';

/** One business day: summary, charts (Admin) and the actual records for that date. Dates use the business timezone on the server. */
export function DailyView({ admin }: { admin?: boolean }) {
  const [date, setDate] = useState(() => businessDate(0));
  const { data: d, loading, error } = useFetch<Json>(`/api/daily?date=${date}`, { pollMs: 60000 });
  const chart = useFetch<Json>(admin ? `/api/dashboard?period=custom&from=${date}&to=${date}` : null);
  const s = d?.summary;
  const tiles: [string, string | undefined, string?][] = [
    ['Total confirmed sales', s && formatPeso(s.totalSales), s && `${s.transactions} transactions`],
    ['Cash collected', s && formatPeso(s.cashOnly)],
    ['GCash / digital collected', s && formatPeso(s.gcashAndDigital)],
    ['New credit sales', s && formatPeso(s.creditSales)],
    ['Debt payments collected', s && formatPeso(s.debtCollections)],
    ['Expenses', s && formatPeso(s.expenses)],
    ['Net cash flow', s && formatPeso(s.netCashFlow), 'Collected − expenses'],
    ['Tube Ice', d && formatPeso(d.tubeIce.amount), d && `${formatQty(d.tubeIce.quantity)} sold · ${formatQty(d.tubeIce.sacks)} sacks`],
    ['Crushed Ice', d && formatPeso(d.crushedIce.amount), d && `${formatQty(d.crushedIce.quantity)} sold · ${formatQty(d.crushedIce.sacks)} sacks`],
    ['Deliveries', d && `${d.deliveryCounts.delivered} delivered`, d && `${d.deliveryCounts.pending} pending · ${d.deliveryCounts.cancelled} cancelled`],
  ];
  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <DayPicker value={date} onChange={setDate} minDate={admin ? undefined : businessDate(-STAFF_HISTORY_DAYS)} />
        {admin && <ExportButtons type="transactions" params={{ period: 'custom', from: date, to: date }} label="Export day" />}
      </div>
      <ErrorNote message={error} />
      <div className="row g-2 mb-4">
        {tiles.map(([l, v, sub]) => (
          <div className="col-6 col-lg-4 col-xl-3" key={l}><div className="card kpi py-2"><div className="kpi-label">{l}</div>{v === undefined ? <Skeleton h={24} w="60%" /> : <div className="kpi-value" style={{ fontSize: '1.2rem' }}>{v}</div>}<div className="small text-muted-2">{sub}</div></div></div>
        ))}
      </div>
      {admin && chart.data && (
        <div className="card mb-4"><div className="card-header">Sales, collections and expenses by hour</div><div className="card-body" style={{ height: 260 }}>
          <ResponsiveContainer><BarChart data={chart.data.series}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" /><XAxis dataKey="label" fontSize={10} interval={2} /><YAxis fontSize={11} tickFormatter={(v) => `₱${v}`} /><Tooltip formatter={(v) => formatPeso(Number(v))} /><Legend /><Bar dataKey="sales" name="Sales" fill="#4aa3d8" /><Bar dataKey="cash" name="Collected" fill="#1b8a5a" /><Bar dataKey="expenses" name="Expenses" fill="#c98a00" /></BarChart></ResponsiveContainer>
        </div></div>
      )}

      <h2 className="h6">Sales &amp; transactions</h2>
      <div className="card mb-4">
        {loading && !d ? <div className="p-3"><Skeleton h={80} /></div> : d?.sales.length === 0 ? <EmptyState title="No sales on this date" /> : (
          <CardTable>
            <table className="table mb-0 align-middle">
              <thead><tr><th>Transaction</th><th>Time</th><th>Customer</th>{admin && <th>Staff</th>}<th>Products</th><th className="text-end">Total</th><th className="text-end">Paid</th><th className="text-end">Remaining</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>
                {d?.sales.map((x: Json) => (
                  <tr key={x.id} className={x.status === 'VOIDED' ? 'text-muted' : ''}>
                    <td><a href={`/receipt/${x.id}`} target="_blank" rel="noreferrer">{x.transactionNumber}</a></td>
                    <td>{formatDateTime(x.createdAt)}</td><td>{x.customer?.name ?? 'Walk-in'}</td>{admin && <td>{x.staff.name}</td>}
                    <td>{x.items.map((i: Json) => `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`).join(', ')}</td>
                    <td className="text-end money">{formatPeso(x.totalAmount)}</td><td className="text-end money">{formatPeso(x.amountPaid)}</td>
                    <td className="text-end money">{x.status === 'VOIDED' ? '—' : formatPeso(Number(x.totalAmount) - Number(x.amountPaid))}</td>
                    <td>{[...new Set(x.payments.filter((p: Json) => p.status === 'ACTIVE').map((p: Json) => PAYMENT_METHOD_LABELS[p.paymentMethod]))].join(', ') || 'Credit'}</td>
                    <td><StatusBadge status={x.status === 'VOIDED' ? 'VOIDED' : x.paymentStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardTable>
        )}
      </div>

      <h2 className="h6">Payments received</h2>
      <div className="card mb-4">
        {d?.payments.length === 0 ? <EmptyState title="No payments on this date" /> : (
          <CardTable>
            <table className="table mb-0">
              <thead><tr><th>Reference</th><th>Time</th><th>Customer</th><th>Type</th><th>Method</th><th className="text-end">Amount</th><th>Status</th></tr></thead>
              <tbody>{d?.payments.map((p: Json) => (
                <tr key={p.id} className={p.status === 'VOIDED' ? 'text-muted' : ''}><td>{p.paymentReference}</td><td>{formatDateTime(p.createdAt)}</td><td>{p.customer?.name ?? 'Walk-in'}</td><td>{p.paymentType === 'DEBT_PAYMENT' ? 'Debt / order payment' : `Sale ${p.sale?.transactionNumber ?? ''}`}</td><td>{PAYMENT_METHOD_LABELS[p.paymentMethod]}{p.reference ? ` · ${p.reference}` : ''}</td><td className="text-end money">{formatPeso(p.amount)}</td><td><StatusBadge status={p.status} /></td></tr>
              ))}</tbody>
            </table>
          </CardTable>
        )}
      </div>

      <h2 className="h6">Deliveries scheduled</h2>
      <div className="card mb-4">
        {d?.deliveries.length === 0 ? <EmptyState title="No deliveries on this date" /> : (
          <CardTable>
            <table className="table mb-0">
              <thead><tr><th>Customer</th><th>Order</th><th>Items</th><th className="text-end">Items total</th><th>Status</th></tr></thead>
              <tbody>{d?.deliveries.map((x: Json) => (
                <tr key={x.id}><td>{x.customer.name}</td><td>{x.orderNumber}</td><td>{x.items.map((i: Json) => `${i.quantity}× ${i.productNameSnapshot} ${i.labelSnapshot}`).join(', ')}</td><td className="text-end money">{formatPeso(x.itemsTotal)}</td><td><StatusBadge status={x.status} label={DELIVERY_STATUS_LABELS[x.status]} /></td></tr>
              ))}</tbody>
            </table>
          </CardTable>
        )}
      </div>

      <h2 className="h6">Expenses</h2>
      <div className="card">
        {d?.expenses.length === 0 ? <EmptyState title="No expenses on this date" /> : (
          <CardTable>
            <table className="table mb-0">
              <thead><tr><th>Description</th><th>Category</th><th>Time</th><th className="text-end">Amount</th><th>Status</th></tr></thead>
              <tbody>{d?.expenses.map((e: Json) => (
                <tr key={e.id} className={e.status === 'VOIDED' ? 'text-muted' : ''}><td>{e.description}</td><td>{e.category}</td><td>{formatDateTime(e.incurredAt)}</td><td className="text-end money">{formatPeso(e.amount)}</td><td><StatusBadge status={e.status} /></td></tr>
              ))}</tbody>
            </table>
          </CardTable>
        )}
      </div>
    </div>
  );
}
