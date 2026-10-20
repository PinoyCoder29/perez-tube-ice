'use client';
import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/client/online';

/**
 * Registers the service worker (production only), shows a quiet "update available" bar (never reloads by itself,
 * so an active sale/payment is never interrupted) and a clear offline notice.
 */
export function PwaClient() {
  const online = useOnline();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const wantsUpdate = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let timer: ReturnType<typeof setInterval> | undefined;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw?.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(nw);
          });
        });
        timer = setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch(() => {});
    const onChange = () => { if (wantsUpdate.current) location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => { if (timer) clearInterval(timer); navigator.serviceWorker.removeEventListener('controllerchange', onChange); };
  }, []);

  return (
    <>
      {!online && (
        <div className="offline-bar" role="status" aria-live="polite">
          <WifiOff size={14} aria-hidden /> You are offline — nothing can be saved. Sales, payments and deliveries are only recorded once the server confirms them.
        </div>
      )}
      {waiting && (
        <div className="update-bar" role="status">
          <span>A new version is ready. Finish any sale or payment in progress first.</span>
          <button className="btn btn-sm btn-light" onClick={() => { wantsUpdate.current = true; waiting.postMessage({ type: 'SKIP_WAITING' }); }}>Update now</button>
          <button className="btn btn-sm btn-outline-light" onClick={() => setWaiting(null)}>Later</button>
        </div>
      )}
    </>
  );
}
