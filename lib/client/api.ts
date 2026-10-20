'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export async function api<T = Json>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. Nothing was saved. Reconnect and try again.');
  }
  let res: Response;
  try {
    res = await fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach the server, so this was NOT confirmed. Check your connection. Retrying a sale or payment is safe: duplicates are prevented.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof location !== 'undefined' && location.pathname.startsWith('/admin') && location.pathname !== '/admin/login') {
      location.href = '/admin/login';
    }
    if (res.status === 403 && data?.error?.includes('change your password') && typeof location !== 'undefined') {
      location.href = '/admin/change-password';
    }
    throw new Error(data?.error ?? 'Request failed. Please try again.');
  }
  return data as T;
}

export function useFetch<T = Json>(url: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!url) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const d = await api<T>(url);
        if (id === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (id === seq.current) setError((e as Error).message);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [url],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!opts.pollMs || !url) return;
    const t = setInterval(() => void load(true), opts.pollMs);
    return () => clearInterval(t);
  }, [opts.pollMs, url, load]);

  return { data, loading, error, reload: () => load(true), setData };
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
