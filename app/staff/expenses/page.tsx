'use client';
import { useState } from 'react';
import { api, useFetch, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { EXPENSE_CATEGORIES, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { EmptyState, ErrorNote, Field, TableSkeleton } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

export default function StaffExpenses() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Json>('/api/expenses?pageSize=50');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/expenses', { body: { category, description, amount, paymentMethod: method, receiptRef: receipt || null, notes: notes || null } });
      toast('Expense saved');
      setCategory(''); setDescription(''); setAmount(''); setReceipt(''); setNotes('');
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-5">
        <div className="card"><div className="card-body">
          <h1 className="h5 fw-bold">Record expense</h1>
          <ErrorNote message={err} />
          <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Category">
            {EXPENSE_CATEGORIES.map((c) => <button key={c} type="button" className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setCategory(c)}>{c}</button>)}
          </div>
          <Field label="Description"><input className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Lunch for staff" /></Field>
          <Field label="Amount (₱)"><input className="form-control form-control-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Paid with">
            <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAYMENT_METHOD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Receipt reference (optional)"><input className="form-control" value={receipt} onChange={(e) => setReceipt(e.target.value)} /></Field>
          <Field label="Notes (optional)"><input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <button className="btn btn-primary confirm-btn w-100" disabled={busy || !category || !description || !(Number(amount) > 0)} onClick={save}>{busy ? 'Saving…' : 'Save expense'}</button>
        </div></div>
      </div>
      <div className="col-12 col-lg-7">
        <div className="card">
          <div className="card-header d-flex justify-content-between"><span>Today&apos;s expenses</span><span className="money">{data ? formatPeso(data.activeTotal) : ''}</span></div>
          {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No expenses today" /> : (
            <ul className="list-group list-group-flush">
              {data?.rows.map((e: Json) => (
                <li className="list-group-item d-flex justify-content-between" key={e.id}>
                  <div><div className="fw-semibold">{e.description}</div><div className="small text-muted-2">{e.category} · {formatDateTime(e.incurredAt)}</div></div>
                  <div className="money fw-semibold">{formatPeso(e.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
