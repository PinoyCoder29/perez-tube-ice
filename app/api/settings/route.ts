import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { settingsBody } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getTimezone } from '@/lib/date';

async function load() {
  const rows = await prisma.setting.findMany();
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  return {
    businessName: m.businessName ?? 'PEREZ ICE',
    businessAddress: m.businessAddress ?? '',
    businessPhone: m.businessPhone ?? '',
    receiptFooter: m.receiptFooter ?? 'Thank you for your purchase!',
    timezone: getTimezone(),
  };
}

// Business name / receipt text are not sensitive and are needed by receipts.
export const GET = route(async () => load());

export const PATCH = route(async (req) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, settingsBody);
  const before = await load();
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  await audit(prisma, { actorId: admin.id, action: 'SETTINGS_UPDATE', entityType: 'Setting', previousValues: before, newValues: b });
  return load();
});
