'use client';
import { useState } from 'react';
import { useFetch, qs, api, type Json } from '@/lib/client/api';
import { formatDate, formatDateTime, formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { Modal } from '@/components/ui/Modal';
import { DebtPaymentModal } from '@/components/customers/DebtPaymentModal';
import { CardTable, CustomersDebtsTabs, EmptyState, ErrorNote, ExportButtons, Field, PageHeader, PeriodPicker, StatusBadge, TableSkeleton, periodReady, usePeriod } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

function Ledger({ customerId, onClose, onChanged }: { customerId: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, error, reload } = useFetch<Json>(`/api/debts/${customerId}`);
  const [adj, setAdj] = useState(false);
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const s = data?.summary;

  async function adjust() {
    setErr(null);
    try { await api(`/api/debts/${customerId}/adjust`, { body: { amount, note } }); toast('Adjustment recorded'); setAdj(false); setAmount(''); setNote(''); reload(); onChanged(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Modal title={data ? `Debt ledger — ${data.customer.name}` : 'Debt ledger'} size="xl" onClose={onClose}>
      <ErrorNote message={error} />
      {loading && !data ? <TableSkeleton /> : data && s && (
        <>
          <div className="card bg-light mb-3"><div className="card-body small">
            <strong>How the balance is calculated</strong>
            <div className="d-flex justify-content-between"><span>Credit charges</span><span className="money">{formatPeso(s.charges)}</span></div>
            <div className="d-flex justify-content-between"><span>− Payments received</span><span className="money">{formatPeso(s.payments)}</span></div>
            <div className="d-flex justify-content-between"><span>± Adjustments</span><span className="money">{formatPeso(s.adjustments)}</span></div>
            <div className="d-flex justify-content-between"><span>Reversals (voided credit / voided payments)</span><span className="money">{formatPeso(Number(s.chargeReversals) + Number(s.paymentReversals))}</span></div>
            <hr className="my-1" /><div className="d-flex justify-content-between fw-bold"><span>Outstanding balance</span><span className="money">{formatPeso(s.balance)}</span></div>
          </div></div>
          <div className="d-flex gap-2 mb-3">
            {Number(s.balance) > 0 && <button className="btn btn-success btn-sm" onClick={() => setPay(true)}>Receive payment</button>}
            <button className="btn btn-outline-primary btn-sm" onClick={() => setAdj((x) => !x)}>Record adjustment</button>
          </div>
          {adj && (
            <div className="border rounded-3 p-3 mb-3">
              <ErrorNote message={err} />
              <div className="row g-2"><div className="col-md-3"><Field label="Amount (− reduces debt)"><input className="form-control" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-50.00" /></Field></div><div className="col-md-7"><Field label="Required note"><input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div><div className="col-md-2 d-flex align-items-end"><button className="btn btn-primary mb-3 w-100" onClick={adjust}>Save</button></div></div>
            </div>
          )}
          <div className="table-responsive"><table className="table table-sm">
            <thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th>Note</th><th>By</th><th className="text-end">Amount</th><th className="text-end">Running balance</th></tr></thead>
            <tbody>{data.entries.map((e: Json) => (
              <tr key={e.id}><td>{formatDateTime(e.createdAt)}</td><td><StatusBadge status={e.type === 'CHARGE' ? 'UNPAID' : e.type === 'PAYMENT' ? 'PAID' : 'CANCELLED'} label={e.type.charAt(0) + e.type.slice(1).toLowerCase()} /></td><td>{e.sale?.transactionNumber ?? e.payment?.paymentReference ?? ''}</td><td>{e.note}</td><td>{e.recordedBy.name}</td><td className={`text-end money ${Number(e.amount) < 0 ? 'text-success' : ''}`}>{formatPeso(e.amount)}</td><td className="text-end money">{formatPeso(e.runningBalance)}</td></tr>
            ))}</tbody></table></div>
          {data.entries.length === 0 && <EmptyState title="No ledger entries" />}
          {pay && <DebtPaymentModal customer={data.customer} balance={s.balance} onClose={() => setPay(false)} onDone={() => { setPay(false); reload(); onChanged(); }} />}
        </>
      )}
    </Modal>
  );
}

export default function AdminDebts() {
  const [p, setP] = usePeriod('month');
  const [useRange, setUseRange] = useState(false);
  const [q, setQ] = useState('');
  const [outstanding, setOutstanding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const url = !useRange || periodReady(p) ? `/api/debts${qs({ cards: 1, q, outstanding: outstanding ? 1 : 0, ...(useRange ? { period: p.period, from: p.from, to: p.to } : {}) })}` : null;
  const { data, loading, error, reload } = useFetch<Json>(url);
  const c = data?.cards;
  const cards: [string, string | undefined][] = [
    ['Total outstanding debt', c && formatPeso(c.totalOutstanding)], ['Credit sales today', c && formatPeso(c.creditSalesToday)], ['Credit sales this month', c && formatPeso(c.creditSalesMonth)],
    ['Debt payments today', c && formatPeso(c.debtPaymentsToday)], ['Debt payments this month', c && formatPeso(c.debtPaymentsMonth)], ['Customers with balances', c && String(c.customersWithBalance)],
    ['Fully paid accounts', c && String(c.fullyPaidAccounts)], ['Partially paid accounts', c && String(c.partiallyPaidAccounts)],
  ];
  return (
    <div>
      <PageHeader title="Utang / Debt Management" actions={<><ExportButtons type="outstanding" params={{ period: 'month' }} label="Balances" /><ExportButtons type="debt-ledger" params={{ period: p.period, from: p.from, to: p.to }} label="Ledger" /></>} />
      <CustomersDebtsTabs active="debts" />
      <div className="row g-3 mb-4">{cards.map(([l, v]) => <div className="col-6 col-lg-3" key={l}><div className="card kpi"><div className="kpi-label">{l}</div><div className="kpi-value">{v ?? '…'}</div></div></div>)}</div>
      <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
        <input className="form-control" style={{ maxWidth: 300 }} placeholder="Search customer…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="form-check"><input id="o" className="form-check-input" type="checkbox" checked={outstanding} onChange={(e) => setOutstanding(e.target.checked)} /><label htmlFor="o" className="form-check-label">Only with balance</label></div>
        <div className="form-check"><input id="r" className="form-check-input" type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} /><label htmlFor="r" className="form-check-label">Only customers with credit in period</label></div>
        {useRange && <PeriodPicker value={p} onChange={setP} />}
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No debt records" text="Credit sales will appear here." /> : (
          <CardTable><table className="table mb-0 align-middle">
            <thead><tr><th>Customer</th><th className="text-end">Balance</th><th>Status</th><th>Contact</th><th className="text-end">Total credit</th><th className="text-end">Payments</th><th>Last purchase</th><th>Last payment</th><th /></tr></thead>
            <tbody>{data?.rows.map((r: Json) => (
              <tr key={r.customerId}><td className="fw-semibold">{r.name}</td><td className="text-end money fw-bold">{formatPeso(r.balance)}</td><td><StatusBadge status={r.status} label={r.status === 'PAID' ? 'Paid' : r.status === 'PARTIAL' ? 'Partially paid' : 'Unpaid'} /></td><td><a href={telHref(r.phone)}>{r.phone}</a></td><td className="text-end money">{formatPeso(r.totalCharges)}</td><td className="text-end money">{formatPeso(r.totalPayments)}</td><td>{formatDate(r.lastPurchase)}</td><td>{formatDate(r.lastPayment)}</td><td><button className="btn btn-sm btn-outline-primary" onClick={() => setOpen(r.customerId)}>Ledger</button></td></tr>
            ))}</tbody></table></CardTable>
        )}
      </div>
      {open && <Ledger customerId={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
