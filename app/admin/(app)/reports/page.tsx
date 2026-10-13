'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, qs, type Json } from '@/lib/client/api';
import { REPORT_TYPES } from '@/services/reports.meta';
import { formatDateTime, formatPeso } from '@/lib/formatting';
import { EmptyState, ErrorNote, PageHeader, PeriodPicker, TableSkeleton, periodReady, usePeriod } from '@/components/ui/common';
import { DELIVERY_STATUS_LABELS } from '@/lib/constants';

export default function ReportsPage() {
  const [type, setType] = useState<string>(REPORT_TYPES[0].id);
  const [p, setP] = usePeriod('month');
  const [group, setGroup] = useState('day');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<Json | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = REPORT_TYPES.find((r) => r.id === type)!;
  const query = { period: p.period, from: p.from, to: p.to, group, status };

  useEffect(() => {
    if (!periodReady(p)) return;
    let live = true;
    setLoading(true);
    api<Json>(`/api/reports/${type}${qs(query)}`).then((d) => live && (setData(d), setError(null))).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, p, group, status]);

  const cell = (c: Json, v: unknown) => (v === null || v === undefined || v === '' ? '' : c.type === 'money' ? formatPeso(v as number) : c.type === 'datetime' ? formatDateTime(v as string) : String(v));

  return (
    <div>
      <PageHeader title="Reports" subtitle="Same definitions and date boundaries as the dashboard (Asia/Manila)." actions={<a className={`btn btn-primary btn-sm ${!periodReady(p) ? 'disabled' : ''}`} href={`/api/reports/${type}${qs({ ...query, format: 'csv' })}`}><Download size={14} aria-hidden /> Export CSV</a>} />
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <select className="form-select" style={{ maxWidth: 380 }} aria-label="Report" value={type} onChange={(e) => setType(e.target.value)}>{REPORT_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        {'grouped' in meta && <select className="form-select" style={{ maxWidth: 140 }} aria-label="Group by" value={group} onChange={(e) => setGroup(e.target.value)}><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Annual</option></select>}
        {'status' in meta && <select className="form-select" style={{ maxWidth: 170 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(DELIVERY_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
        <PeriodPicker value={p} onChange={setP} />
      </div>
      <ErrorNote message={error} />
      <div className="card">
        <div className="card-header">{data?.title ?? meta.label}</div>
        {loading && !data ? <TableSkeleton /> : !data || data.rows.length === 0 ? <EmptyState title="No data for this selection" /> : (
          <div className="table-responsive"><table className="table table-sm mb-0">
            <thead><tr>{data.columns.map((c: Json) => <th key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-end' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>{data.rows.map((r: Json, i: number) => <tr key={i}>{data.columns.map((c: Json) => <td key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-end money' : ''}>{cell(c, r[c.key])}</td>)}</tr>)}</tbody></table></div>
        )}
      </div>
    </div>
  );
}
