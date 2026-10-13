import { HttpError } from '@/lib/errors';

export const DEFAULT_TZ = 'Asia/Manila';
export function getTimezone(): string {
  return process.env.BUSINESS_TIMEZONE || DEFAULT_TZ;
}

export type Ymd = { y: number; m: number; d: number };
export type Period = 'today' | 'week' | 'month' | 'year' | 'custom';
export type Granularity = 'hour' | 'day' | 'month';
export type Group = 'day' | 'week' | 'month' | 'year';

export interface DateRange {
  period: Period;
  start: Date; // inclusive (UTC instant)
  end: Date; // exclusive
  startYmd: Ymd;
  endYmd: Ymd; // exclusive
  granularity: Granularity;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtYmd = (v: Ymd) => `${v.y}-${pad(v.m)}-${pad(v.d)}`;

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to the real UTC instant. */
export function zonedTimeToUtc(y: number, m: number, d: number, h = 0, mi = 0, tz = getTimezone()): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let utc = guess - offsetMs(new Date(guess), tz);
  utc = guess - offsetMs(new Date(utc), tz);
  return new Date(utc);
}

export function localYmd(date: Date, tz = getTimezone()): Ymd {
  const p = parts(date, tz);
  return { y: p.year, m: p.month, d: p.day };
}

export function addDays(v: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(v.y, v.m - 1, v.d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addMonths(v: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(v.y, v.m - 1 + n, 1));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: 1 };
}

export function parseYmd(s: string | null | undefined): Ymd | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const v = { y: +m[1], m: +m[2], d: +m[3] };
  const chk = new Date(Date.UTC(v.y, v.m - 1, v.d));
  if (chk.getUTCFullYear() !== v.y || chk.getUTCMonth() + 1 !== v.m || chk.getUTCDate() !== v.d) return null;
  return v;
}

export function diffDays(a: Ymd, b: Ymd): number {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

export function startOfWeek(v: Ymd): Ymd {
  const wd = new Date(Date.UTC(v.y, v.m - 1, v.d)).getUTCDay(); // 0 = Sunday
  return addDays(v, -((wd + 6) % 7)); // Monday
}

export const dayStart = (v: Ymd, tz = getTimezone()) => zonedTimeToUtc(v.y, v.m, v.d, 0, 0, tz);

function make(period: Period, s: Ymd, e: Ymd, granularity: Granularity, label: string, tz: string): DateRange {
  return { period, startYmd: s, endYmd: e, start: dayStart(s, tz), end: dayStart(e, tz), granularity, label };
}

export function resolveRange(
  period: Period,
  opts: { from?: string | null; to?: string | null } = {},
  now = new Date(),
  tz = getTimezone(),
): DateRange {
  const today = localYmd(now, tz);
  switch (period) {
    case 'today':
      return make('today', today, addDays(today, 1), 'hour', 'Today', tz);
    case 'week': {
      const s = startOfWeek(today);
      return make('week', s, addDays(s, 7), 'day', 'This week', tz);
    }
    case 'month': {
      const s = { ...today, d: 1 };
      return make('month', s, addMonths(s, 1), 'day', 'This month', tz);
    }
    case 'year': {
      const s = { y: today.y, m: 1, d: 1 };
      return make('year', s, { y: today.y + 1, m: 1, d: 1 }, 'month', 'This year', tz);
    }
    case 'custom': {
      const f = parseYmd(opts.from);
      const t = parseYmd(opts.to);
      if (!f || !t) throw new HttpError(400, 'Custom range needs valid from and to dates (YYYY-MM-DD).');
      const e = addDays(t, 1);
      const days = diffDays(f, e);
      if (days < 1) throw new HttpError(400, 'The "from" date must be on or before the "to" date.');
      if (days > 800) throw new HttpError(400, 'Date range is too large (max about 2 years).');
      return make('custom', f, e, days > 92 ? 'month' : 'day', `${fmtYmd(f)} to ${fmtYmd(t)}`, tz);
    }
  }
}

export function previousRange(r: DateRange, tz = getTimezone()): DateRange {
  const s0 = r.startYmd;
  switch (r.period) {
    case 'today':
      return make('today', addDays(s0, -1), s0, r.granularity, 'Yesterday', tz);
    case 'week':
      return make('week', addDays(s0, -7), s0, r.granularity, 'Last week', tz);
    case 'month':
      return make('month', addMonths(s0, -1), s0, r.granularity, 'Last month', tz);
    case 'year':
      return make('year', { y: s0.y - 1, m: 1, d: 1 }, s0, r.granularity, 'Last year', tz);
    default: {
      const len = diffDays(r.startYmd, r.endYmd);
      return make('custom', addDays(s0, -len), s0, r.granularity, 'Previous period', tz);
    }
  }
}

export function bucketKey(date: Date, g: Granularity, tz = getTimezone()): string {
  const p = parts(date, tz);
  if (g === 'hour') return `${pad(p.hour)}:00`;
  if (g === 'month') return `${p.year}-${pad(p.month)}`;
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function bucketKeys(r: DateRange): string[] {
  if (r.granularity === 'hour') return Array.from({ length: 24 }, (_, h) => `${pad(h)}:00`);
  const keys: string[] = [];
  if (r.granularity === 'month') {
    for (
      let c = { ...r.startYmd, d: 1 };
      Date.UTC(c.y, c.m - 1, 1) < Date.UTC(r.endYmd.y, r.endYmd.m - 1, r.endYmd.d);
      c = addMonths(c, 1)
    ) {
      keys.push(`${c.y}-${pad(c.m)}`);
    }
    return keys;
  }
  for (let c = r.startYmd; diffDays(c, r.endYmd) > 0; c = addDays(c, 1)) keys.push(fmtYmd(c));
  return keys;
}

export function bucketLabel(key: string, g: Granularity): string {
  if (g === 'hour') return key;
  const [y, m, d] = key.split('-').map(Number);
  if (g === 'month') return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Grouping key for reports (day / week(Mon) / month / year). */
export function groupKey(date: Date, g: Group, tz = getTimezone()): string {
  const v = localYmd(date, tz);
  if (g === 'year') return String(v.y);
  if (g === 'month') return `${v.y}-${pad(v.m)}`;
  if (g === 'week') return fmtYmd(startOfWeek(v));
  return fmtYmd(v);
}
