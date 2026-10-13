'use client';
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, Boxes, CreditCard, Package, Receipt, Snowflake, Truck, TrendingUp, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch, qs, type Json } from '@/lib/client/api';
import { formatPeso, formatQty } from '@/lib/formatting';
import { ErrorNote, PageHeader, PeriodPicker, Skeleton, periodReady, usePeriod } from '@/components/ui/common';

const peso = (v: unknown) => formatPeso(Number(v));
const C = { navy: '#13315c', ice: '#4aa3d8', green: '#1b8a5a', amber: '#c98a00', red: '#c0392b', grey: '#9fb0c3' };

function Delta({ pct, label }: { pct: number | null | undefined; label: string }) {
  if (pct === null || pct === undefined) return <span className="delta none">No {label.toLowerCase()} data to compare</span>;
  const up = pct >= 0;
  return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />} {Math.abs(pct).toFixed(1)}% vs {label.toLowerCase()}</span>;
}

function Kpi({ icon: Icon, label, value, sub, delta }: { icon: typeof Receipt; label: string; value?: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="card kpi">
      <div className="d-flex justify-content-between align-items-start mb-2"><div className="kpi-label">{label}</div><div className="kpi-icon"><Icon size={18} aria-hidden /></div></div>
      {value === undefined ? <Skeleton h={30} w="70%" /> : <div className="kpi-value">{value}</div>}
      {sub && <div className="small text-muted-2">{sub}</div>}
      {delta}
    </div>
  );
}

function ChartCard({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="card h-100">
      <div className="card-header d-flex justify-content-between align-items-center gap-2 flex-wrap"><span>{title}</span>{actions}</div>
      <div className="card-body" style={{ height: 300 }}>{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const [p, setP] = usePeriod('today');
  const [metric, setMetric] = useState<'amount' | 'quantity' | 'transactions'>('amount');
  const { data: d, error } = useFetch<Json>(periodReady(p) ? `/api/dashboard${qs({ period: p.period, from: p.from, to: p.to })}` : null, { pollMs: 60000 });
  const s = d?.summary;
  const label = d?.previousLabel ?? 'previous period';
  const ch = d?.changes;
  const net = s && s.netCashFlow;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={d ? `${d.range.label}` : ' '} actions={<PeriodPicker value={p} onChange={setP} />} />
      <ErrorNote message={error} />
      <div className="row g-3 mb-4">
        {[
          <Kpi key="a" icon={Receipt} label="Total sales" value={s && formatPeso(s.totalSales)} sub={s && `${s.transactions} transactions`} delta={d && <Delta pct={ch?.totalSales} label={label} />} />,
          <Kpi key="b" icon={Banknote} label="Cash collections" value={s && formatPeso(s.cashCollections)} sub="Incl. payments on old utang" delta={d && <Delta pct={ch?.cashCollections} label={label} />} />,
          <Kpi key="c" icon={CreditCard} label="Credit sales" value={s && formatPeso(s.creditSales)} sub="Unpaid, charged to accounts" delta={d && <Delta pct={ch?.creditSales} label={label} />} />,
          <Kpi key="d" icon={Wallet} label="Total outstanding debt" value={d && formatPeso(d.outstandingDebt)} sub="All customers, as of now" />,
          <Kpi key="e" icon={Receipt} label="Total expenses" value={s && formatPeso(s.expenses)} delta={d && <Delta pct={ch?.expenses} label={label} />} />,
          <Kpi key="f" icon={TrendingUp} label="Net cash flow" value={s && formatPeso(net)} sub="Collections − expenses" />,
          <Kpi key="g" icon={Snowflake} label="Crushed ice sold" value={d && formatPeso(d.crushedIce.amount)} sub={d && `${formatQty(d.crushedIce.quantity)} packs · ${formatQty(d.crushedIce.sacks)} sacks`} />,
          <Kpi key="h" icon={Package} label="Tube ice sold" value={d && formatPeso(d.tubeIce.amount)} sub={d && `${formatQty(d.tubeIce.quantity)} packs · ${formatQty(d.tubeIce.sacks)} sacks`} />,
          <Kpi key="i" icon={Boxes} label="Total sacks sold" value={s && formatQty(s.sacksSold)} sub={s && `${formatQty(s.packsSold)} units/packs overall`} />,
          <Kpi key="j" icon={Truck} label="Pending deliveries" value={d && String(d.pendingDeliveries)} sub="Pending, assigned or out" />,
        ].map((k, i) => <div className="col-6 col-lg-4 col-xl-3" key={i}>{k}</div>)}
      </div>
      {s && <div className="small text-muted-2 mb-3">Operating result (sales − expenses): <strong className="money">{formatPeso(s.operatingResult)}</strong> — accrual basis: sales are counted when made, whether or not they are paid yet.</div>}

      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <ChartCard title="Sales trend">
            <ResponsiveContainer><LineChart data={d?.series ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `₱${v}`} /><Tooltip formatter={peso} /><Line type="monotone" dataKey="sales" name="Sales" stroke={C.navy} strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="col-12 col-xl-6">
          <ChartCard title={`Sales vs ${label.toLowerCase()}`} actions={d && (d.comparison.hasPrevious ? <span className="small">{d.comparison.diff >= 0 ? '+' : '−'}{formatPeso(Math.abs(d.comparison.diff))}{d.comparison.pct !== null && ` (${d.comparison.pct >= 0 ? '+' : ''}${d.comparison.pct}%)`}</span> : <span className="small text-muted-2">Not enough history to compare</span>)}>
            <ResponsiveContainer><LineChart data={d?.comparison.points ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `₱${v}`} /><Tooltip formatter={peso} /><Legend /><Line type="monotone" dataKey="current" name="Selected period" stroke={C.navy} strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="previous" name={label} stroke={C.grey} strokeWidth={2} strokeDasharray="5 4" dot={false} /></LineChart></ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="col-12 col-xl-6">
          <ChartCard title="Product sales" actions={<div className="btn-group btn-group-sm">{(['amount', 'quantity', 'transactions'] as const).map((m) => <button key={m} className={`btn ${metric === m ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMetric(m)}>{m === 'amount' ? 'Sales ₱' : m === 'quantity' ? 'Quantity' : 'Transactions'}</button>)}</div>}>
            <ResponsiveContainer><BarChart data={d?.products ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={11} /><Tooltip formatter={(v) => (metric === 'amount' ? peso(v) : String(v))} /><Bar dataKey={metric} name={metric === 'amount' ? 'Sales' : metric === 'quantity' ? 'Units sold' : 'Transactions'} fill={C.ice} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="col-12 col-xl-6">
          <ChartCard title="Payment breakdown">
            <ResponsiveContainer><BarChart data={d?.paymentBreakdown ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `₱${v}`} /><Tooltip formatter={peso} /><Bar dataKey="value" name="Amount" fill={C.green} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="col-12 col-xl-6">
          <ChartCard title="Expenses vs sales">
            <ResponsiveContainer><ComposedChart data={d?.series ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `₱${v}`} /><Tooltip formatter={peso} /><Legend /><Bar dataKey="sales" name="Sales" fill={C.ice} /><Bar dataKey="expenses" name="Expenses" fill={C.amber} /><Line type="monotone" dataKey="net" name="Operating result" stroke={C.navy} strokeWidth={2.5} dot={false} /></ComposedChart></ResponsiveContainer>
          </ChartCard>
        </div>
        <div className="col-12 col-xl-6">
          <ChartCard title="Debt monitoring">
            <ResponsiveContainer><ComposedChart data={d?.series ?? []}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaf2" /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => `₱${v}`} /><Tooltip formatter={peso} /><Legend /><Bar dataKey="creditSales" name="New credit sales" fill={C.red} /><Bar dataKey="debtPayments" name="Debt payments collected" fill={C.green} /><Line type="monotone" dataKey="outstanding" name="Outstanding balance" stroke={C.navy} strokeWidth={2.5} dot={false} /></ComposedChart></ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
