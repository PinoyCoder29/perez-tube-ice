'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { ErrorNote } from '@/components/ui/common';

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mustChangePassword: boolean }>('/api/auth/login', { body: { username, password } });
      router.replace(r.mustChangePassword ? '/admin/change-password' : '/admin/dashboard');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <div className="container" style={{ maxWidth: 440 }}>
        <div className="entry-card">
          <h1 className="h3 fw-bold mb-0">Admin login</h1>
          <p className="text-muted-2 mb-1">PEREZ ICE management</p>
          <ErrorNote message={error} />
          <form onSubmit={submit} className="d-grid gap-3">
            <div>
              <label className="form-label" htmlFor="u">Username</label>
              <input id="u" className="form-control form-control-lg" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div>
              <label className="form-label" htmlFor="p">Password</label>
              <input id="p" type="password" className="form-control form-control-lg" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
          </form>
          <Link href="/" className="small text-center mt-2">Back</Link>
        </div>
      </div>
    </main>
  );
}
