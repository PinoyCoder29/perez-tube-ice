'use client';
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { api, useFetch, qs, type Json } from '@/lib/client/api';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { Modal } from '@/components/ui/Modal';
import { CardTable, EmptyState, ErrorNote, ExportButtons, Field, PageHeader, Pager, PeriodPicker, StatusBadge, TableSkeleton, periodReady, usePeriod } from '@/components/ui/common';
import { useAsk, useToast } from '@/components/ui/providers';

function EditModal({ e, onClose, onSaved }: { e: Json; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ category: e.category, description: e.description, amount: Number(e.amount).toFixed(2), notes: e.notes ?? '' });
  const [err, setErr] = useState<string | null>(null);
  async function save() {
    try { await api(`/api/expenses/${e.id}`, { method: 'PATCH', body: { ...f, notes: f.notes || null } }); toast('Expense updated (change is logged)'); onSaved(); } catch (x) { setErr((x as Error).message); }
  }
  return (
    <Modal title="Edit expense" onClose={onClose} footer={<><button className="btn btn-light" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save changes</button></>}>
      <ErrorNote message={err} />
      <Field label="Category"><select className="form-select" value={f.category} onChange={(x) => setF({ ...f, category: x.target.value })}>{[...new Set([f.category, ...EXPENSE_CATEGORIES])].map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Description"><input className="form-control" value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} /></Field>
      <Field label="Amount (₱)"><input className="form-control" value={f.amount} onChange={(x) => setF({ ...f, amount: x.target.value })} /></Field>
      <Field label="Notes"><input className="form-control" value={f.notes} onChange={(x) => setF({ ...f, notes: x.target.value })} /></Field>
    </Modal>
  );
}

export default function AdminExpenses() {
  const [p, setP] = usePeriod('month');
  const [category, setCategory] = useState('');
  const [staffId, setStaffId] = useState('');
  const [voided, setVoided] = useState(false);
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Json | null>(null);
  const users = useFetch<Json[]>('/api/users');
  const filt = { ...p, category, staffId, voided: voided ? 1 : 0 };
  const { data, loading, error, reload } = useFetch<Json>(periodReady(p) ? `/api/expenses${qs({ ...filt, page, pageSize: 25 })}` : null);
  const ask = useAsk();
  const toast = useToast();

  async function voidIt(e: Json) {
    const r = await ask({ title: 'Void this expense?', message: `${e.description} — ${formatPeso(e.amount)}. It stays on record but no longer counts in totals.`, reason: true, danger: true, confirmText: 'Void expense' });
    if (!r.ok) return;
    try { await api(`/api/expenses/${e.id}/void`, { body: { reason: r.reason } }); toast('Expense voided'); reload(); } catch (x) { toast((x as Error).message, 'danger'); }
  }

  return (
    <div>
      <PageHeader title="Expenses" actions={<><PeriodPicker value={p} onChange={(v) => { setP(v); setPage(1); }} /><ExportButtons type="expenses-list" params={{ period: p.period, from: p.from, to: p.to }} label="Export" /></>} />
      <div className="d-flex flex-wrap gap-2 mb-3">
        <select className="form-select" style={{ maxWidth: 220 }} aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select className="form-select" style={{ maxWidth: 200 }} aria-label="Staff" value={staffId} onChange={(e) => { setStaffId(e.target.value); setPage(1); }}><option value="">All staff</option>{users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <div className="form-check align-self-center"><input id="v" className="form-check-input" type="checkbox" checked={voided} onChange={(e) => setVoided(e.target.checked)} /><label htmlFor="v" className="form-check-label">Show voided</label></div>
        {data && <div className="ms-auto align-self-center fw-bold">Total (active): <span className="money">{formatPeso(data.activeTotal)}</span></div>}
      </div>
      <ErrorNote message={error} />
      <div className="card">
        {loading && !data ? <TableSkeleton /> : data?.rows.length === 0 ? <EmptyState title="No expenses in this period" /> : (
          <CardTable><table className="table mb-0 align-middle">
            <thead><tr><th>Description</th><th className="text-end">Amount</th><th>Category</th><th>Date</th><th>By</th><th>Status</th><th /></tr></thead>
            <tbody>{data?.rows.map((e: Json) => (
              <tr key={e.id} className={e.status === 'VOIDED' ? 'text-muted' : ''}><td>{e.description}{e.voidReason && <div className="small">Void reason: {e.voidReason}</div>}</td><td className={`text-end money ${e.status === 'VOIDED' ? 'text-decoration-line-through' : ''}`}>{formatPeso(e.amount)}</td><td>{e.category}</td><td>{formatDateTime(e.incurredAt)}</td><td>{e.staff.name}</td><td><StatusBadge status={e.status} /></td>
                <td className="text-nowrap">{e.status === 'ACTIVE' && <><button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEdit(e)}><Pencil size={13} aria-hidden /> Edit</button><button className="btn btn-sm btn-outline-danger" onClick={() => voidIt(e)}>Void</button></>}</td></tr>
            ))}</tbody></table></CardTable>
        )}
        {data && <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />}
      </div>
      {edit && <EditModal e={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}
