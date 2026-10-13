'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Kind = 'success' | 'danger' | 'info';
const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

interface AskOpts {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  reason?: boolean; // require a typed reason
}
type AskFn = (o: AskOpts) => Promise<{ ok: boolean; reason: string }>;
const AskCtx = createContext<AskFn>(async () => ({ ok: false, reason: '' }));
export const useAsk = () => useContext(AskCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: Kind }[]>([]);
  const idRef = useRef(0);
  const push = useCallback((msg: string, kind: Kind = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'danger' ? 6000 : 3500);
  }, []);

  const [ask, setAsk] = useState<(AskOpts & { resolve: (v: { ok: boolean; reason: string }) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const askFn: AskFn = useCallback(
    (o) =>
      new Promise((resolve) => {
        setReason('');
        setAsk({ ...o, resolve });
      }),
    [],
  );
  const close = (ok: boolean) => {
    if (!ask) return;
    ask.resolve({ ok, reason: reason.trim() });
    setAsk(null);
  };

  useEffect(() => {
    if (!ask) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <ToastCtx.Provider value={push}>
      <AskCtx.Provider value={askFn}>
        {children}
        <div className="toast-wrap" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} role="status" className={`toast show align-items-center text-bg-${t.kind === 'danger' ? 'danger' : t.kind === 'info' ? 'primary' : 'success'} border-0`}>
              <div className="d-flex">
                <div className="toast-body fw-semibold">{t.msg}</div>
                <button type="button" className="btn-close btn-close-white me-2 m-auto" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />
              </div>
            </div>
          ))}
        </div>
        {ask && (
          <>
            <div className="modal-backdrop-lite" onClick={() => close(false)} />
            <div className="modal d-block" role="dialog" aria-modal="true" aria-label={ask.title}>
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header">
                    <h5 className="modal-title">{ask.title}</h5>
                  </div>
                  <div className="modal-body">
                    {ask.message && <p className="mb-2">{ask.message}</p>}
                    {ask.reason && (
                      <>
                        <label className="form-label" htmlFor="ask-reason">Reason</label>
                        <input id="ask-reason" autoFocus className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
                      </>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button className="btn btn-light" onClick={() => close(false)}>Cancel</button>
                    <button className={`btn ${ask.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!!ask.reason && reason.trim().length < 3} onClick={() => close(true)}>
                      {ask.confirmText ?? 'Confirm'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </AskCtx.Provider>
    </ToastCtx.Provider>
  );
}
