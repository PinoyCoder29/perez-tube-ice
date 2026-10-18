export const TZ = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || 'Asia/Manila';

/** YYYY-MM-DD in the business timezone, `offsetDays` from today (client-safe; never uses the browser's local date). */
export function businessDate(offsetDays = 0, tz = TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function formatPeso(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number.isFinite(n) ? n : 0);
}

export function formatQty(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Number.isFinite(n) ? n : 0);
}

export function formatDateTime(v: string | Date | null | undefined, tz = TZ): string {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-PH', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
}

export function formatDate(v: string | Date | null | undefined, tz = TZ): string {
  if (!v) return '—';
  return new Intl.DateTimeFormat('en-PH', { timeZone: tz, dateStyle: 'medium' }).format(new Date(v));
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
