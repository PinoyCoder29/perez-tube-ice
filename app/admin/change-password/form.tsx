'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { ErrorNote } from '@/components/ui/common';
import { useToast } from '@/components/ui/providers';

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== again) return setError('The new passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/change-password', { body: { currentPassword: cur, newPassword: next } });
      toast('Password changed');
      router.replace('/admin/dashboard');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <div className="container" style={{ maxWidth: 460 }}>
        <div className="entry-card">
          <h1 className="h3 fw-bold mb-0">Change password</h1>
          {forced && <p className="text-muted-2 mb-1">For security, choose a new password before continuing.</p>}
          <ErrorNote message={error} />
          <form onSubmit={submit} className="d-grid gap-3">
            <div>
              <label className="form-label" htmlFor="c">Current password</label>
              <input id="c" type="password" className="form-control" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
            </div>
            <div>
              <label className="form-label" htmlFor="n">New password (10+ characters)</label>
              <input id="n" type="password" className="form-control" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
            </div>
            <div>
              <label className="form-label" htmlFor="a">Repeat new password</label>
              <input id="a" type="password" className="form-control" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
