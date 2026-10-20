'use client';
import { useEffect, useState } from 'react';
import { MapPin, Phone, Search } from 'lucide-react';
import { api, type Json } from '@/lib/client/api';
import { formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { PAYMENT_STATUS_LABELS } from '@/lib/constants';
import { EmptyState, ErrorNote, Skeleton, StatusBadge } from '@/components/ui/common';

const PAGE = 20;

/**
 * Tab A — every active customer (including ones who never ordered a delivery).
 * Being listed here does NOT mean the customer has a delivery order.
 */
export function CustomersTab({ onCreate, onDetails, refreshKey }: { onCreate: (c: Json) => void; onDetails: (id: string) => void; refreshKey: number }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Json[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(skip: number, replace: boolean) {
    setLoading(true);
    try {
      const r = await api<Json>(`/api/customers?q=${encodeURIComponent(q)}&take=${PAGE}&skip=${skip}`);
      setRows((prev) => (replace ? r.rows : [...prev, ...r.rows]));
      setTotal(r.total);
      setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  useEffect(() => {
    const t = setTimeout(() => void load(0, true), 200);
    return () => clearTimeout(t);
  }, [q, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="input-group mb-3" style={{ maxWidth: 520 }}>
        <span className="input-group-text bg-white"><Search size={16} aria-hidden /></span>
        <input className="form-control form-control-lg" placeholder="Search name, phone number or address…" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorNote message={error} />
      {loading && rows.length === 0 ? <div className="d-grid gap-2">{[1, 2, 3].map((i) => <Skeleton key={i} h={110} />)}</div> : rows.length === 0 ? <div className="card"><EmptyState title="Customer not found" text="Try another name, number or address. If the customer is not in the system, only the Admin can add them — ask the Admin to add the customer first." /></div> : (
        <>
          <div className="small text-muted-2 mb-2">{total} active customer{total === 1 ? '' : 's'}</div>
          <div className="row g-3">
            {rows.map((c) => (
              <div className="col-12 col-xl-6" key={c.id}>
                <div className={`card order-card h-100 st-${c.accountStatus === 'UNPAID' ? 'unpaid' : c.accountStatus === 'PARTIAL' ? 'partial' : c.accountStatus === 'PAID' ? 'paid' : 'cancelled'}`}>
                  <div className="card-body">
                    <div className="d-flex justify-content-between gap-2 flex-wrap">
                      <div className="wrap-any"><div className="fw-bold">{c.name}</div><a className="btn btn-outline-primary btn-sm mt-1" href={telHref(c.phone)}><Phone size={14} aria-hidden /> {c.phone}</a></div>
                      <div className="text-end">
                        <div className="small text-muted-2">Outstanding debt</div>
                        <div className={`fw-bold money ${Number(c.outstandingBalance) > 0 ? 'text-danger' : ''}`}>{formatPeso(c.outstandingBalance)}</div>
                        {c.accountStatus ? <StatusBadge status={c.accountStatus} label={PAYMENT_STATUS_LABELS[c.accountStatus]} /> : <span className="small text-muted-2">No credit history</span>}
                      </div>
                    </div>
                    <div className="mt-2 wrap-any"><MapPin size={14} aria-hidden /> {c.address}{c.landmark ? ` (${c.landmark})` : ''}</div>
                    <div className="d-flex gap-2 mt-3">
                      <button className="btn btn-outline-primary flex-grow-1" onClick={() => onDetails(c.id)}>View details</button>
                      <button className="btn btn-primary flex-grow-1" onClick={() => onCreate(c)}>Create delivery</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {rows.length < total && <div className="text-center mt-3"><button className="btn btn-outline-primary" disabled={loading} onClick={() => load(rows.length, false)}>{loading ? 'Loading…' : 'Load more'}</button></div>}
        </>
      )}
    </div>
  );
}
