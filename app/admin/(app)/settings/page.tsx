'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, useFetch, type Json } from '@/lib/client/api';
import { ErrorNote, Field, PageHeader } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

export default function SettingsPage() {
  const { data, error } = useFetch<Json>('/api/settings');
  const toast = useToast();
  const [f, setF] = useState({ businessName: '', businessAddress: '', businessPhone: '', receiptFooter: '', customPriceMax: '5000', allowStaffCustomPrice: true });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (data) setF({ businessName: data.businessName, businessAddress: data.businessAddress, businessPhone: data.businessPhone, receiptFooter: data.receiptFooter, customPriceMax: String(data.customPriceMax), allowStaffCustomPrice: data.allowStaffCustomPrice }); }, [data]);
  async function save() {
    try { await api('/api/settings', { method: 'PATCH', body: f }); toast('Settings saved'); setErr(null); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="Settings" />
      <ErrorNote message={error ?? err} />
      <div className="card mb-3"><div className="card-body">
        <h2 className="h6">Business &amp; receipt</h2>
        <Field label="Business name"><input className="form-control" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
        <Field label="Address"><input className="form-control" value={f.businessAddress} onChange={(e) => setF({ ...f, businessAddress: e.target.value })} /></Field>
        <Field label="Phone"><input className="form-control" value={f.businessPhone} onChange={(e) => setF({ ...f, businessPhone: e.target.value })} /></Field>
        <Field label="Receipt footer"><input className="form-control" value={f.receiptFooter} onChange={(e) => setF({ ...f, receiptFooter: e.target.value })} /></Field>
        <h2 className="h6 mt-4">Custom price rules (POS)</h2>
        <div className="form-check form-switch mb-2"><input id="acp" className="form-check-input" type="checkbox" checked={f.allowStaffCustomPrice} onChange={(e) => setF({ ...f, allowStaffCustomPrice: e.target.checked })} /><label htmlFor="acp" className="form-check-label">Staff may sell at a custom price</label></div>
        <Field label="Highest custom price allowed (₱)" hint="The server rejects anything above this, or zero / negative prices."><input className="form-control" inputMode="decimal" value={f.customPriceMax} onChange={(e) => setF({ ...f, customPriceMax: e.target.value })} /></Field>
        <div className="small text-muted-2 mb-3">Timezone: {data?.timezone ?? '…'} (set with the BUSINESS_TIMEZONE environment variable)</div>
        <button className="btn btn-primary" onClick={save} disabled={!f.businessName}>Save settings</button>
      </div></div>
      <div className="card"><div className="card-body">
        <h2 className="h6">Security</h2>
        <p className="small text-muted-2">Staff access is intentionally passwordless: anyone who can open this site can use the Staff screens. Staff actions are recorded under one shared “Staff” identity.</p>
        <Link href="/admin/change-password" className="btn btn-outline-primary">Change Admin password</Link>
      </div></div>
    </div>
  );
}
