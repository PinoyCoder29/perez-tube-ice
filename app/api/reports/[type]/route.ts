import { NextResponse } from 'next/server';
import { route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { REPORT_TYPES, runReport, toCsv } from '@/services/reports.service';
import { fmtYmd, localYmd, type Group, type Period } from '@/lib/date';

export const GET = route(async (req, { params }) => {
  await requireAdmin();
  const sp = req.nextUrl.searchParams;
  const period = (['today', 'week', 'month', 'year', 'custom'].includes(sp.get('period') ?? '') ? sp.get('period') : 'month') as Period;
  const group = (['day', 'week', 'month', 'year'].includes(sp.get('group') ?? '') ? sp.get('group') : 'day') as Group;
  const result = await runReport(params.type, { period, from: sp.get('from'), to: sp.get('to'), group, status: sp.get('status') });
  if (sp.get('format') === 'csv') {
    const name = `${REPORT_TYPES.find((r) => r.id === params.type)?.id ?? 'report'}-${fmtYmd(localYmd(new Date()))}.csv`;
    return new NextResponse(toCsv(result), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
    });
  }
  return result;
});
