export const TZ = 'Asia/Manila';

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
