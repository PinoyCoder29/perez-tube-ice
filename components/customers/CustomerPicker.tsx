'use client';
import { useEffect, useState } from 'react';
import { Phone, Plus, Search, X } from 'lucide-react';
import { api, type Json } from '@/lib/client/api';
import { formatPeso } from '@/lib/formatting';
import { telHref } from '@/lib/phone';
import { CustomerForm } from './CustomerForm';

export function CustomerPicker({ value, onChange, placeholder = 'Search customer by name or number…' }: { value: Json | null; onChange: (c: Json | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Json[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ rows: Json[] }>(`/api/customers?q=${encodeURIComponent(q)}&take=15`);
        setRows(r.rows);
      } catch {
        setRows([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  if (value) {
    return (
      <div className="d-flex align-items-center gap-2 p-2 border rounded-3 bg-white">
        <div className="flex-grow-1">
          <div className="fw-semibold">{value.name}</div>
          <div className="small text-muted-2">
            <a href={telHref(value.phone)} className="me-2"><Phone size={12} aria-hidden /> {value.phone}</a>
            Balance: <span className="money fw-semibold">{formatPeso(value.outstandingBalance)}</span>
          </div>
        </div>
        <button className="btn btn-sm btn-light" onClick={() => onChange(null)} aria-label="Remove customer"><X size={16} /></button>
      </div>
    );
  }

  return (
    <div className="position-relative">
      <div className="input-group">
        <span className="input-group-text bg-white"><Search size={16} aria-hidden /></span>
        <input className="form-control" placeholder={placeholder} value={q} aria-label="Search customer" onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
        <button className="btn btn-outline-primary" type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New</button>
      </div>
      {open && (
        <div className="list-pick position-absolute w-100 mt-1 shadow" style={{ zIndex: 50 }}>
          {rows.length === 0 && <div className="p-3 text-muted-2 small">No matching customers.</div>}
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => { onChange(c); setOpen(false); setQ(''); }}>
              <div className="d-flex justify-content-between">
                <span className="fw-semibold">{c.name}</span>
                {Number(c.outstandingBalance) > 0 && <span className="pill bad money">{formatPeso(c.outstandingBalance)}</span>}
              </div>
              <div className="small text-muted-2">{c.phone} · {c.address}</div>
            </button>
          ))}
          <button type="button" className="text-center text-muted-2 small" onClick={() => setOpen(false)}>Close list</button>
        </div>
      )}
      {creating && <CustomerForm onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); onChange({ ...c, outstandingBalance: '0' }); }} />}
    </div>
  );
}
