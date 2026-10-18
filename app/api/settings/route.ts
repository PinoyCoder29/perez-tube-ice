import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { settingsBody } from '@/lib/validation';
import { requireAdmin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { getSettings } from '@/services/settings.service';

// Business name / receipt text / custom-price limits are not sensitive and are needed by the POS and receipts.
export const GET = route(async () => getSettings());

export const PATCH = route(async (req) => {
  const admin = await requireAdmin();
  const b = await parseJson(req, settingsBody);
  const before = await getSettings();
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  await audit(prisma, { actorId: admin.id, action: 'SETTINGS_UPDATE', entityType: 'Setting', previousValues: before, newValues: b });
  return getSettings();
});
