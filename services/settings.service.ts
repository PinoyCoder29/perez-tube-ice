import { prisma, type DB } from '@/lib/db/prisma';
import { DEFAULT_CUSTOM_PRICE_MAX } from '@/lib/constants';
import { getTimezone } from '@/lib/date';

export async function getSettings(db: DB = prisma) {
  const rows = await db.setting.findMany();
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
  const max = Number(m.customPriceMax);
  return {
    businessName: (m.businessName as string) ?? 'PEREZ ICE',
    businessAddress: (m.businessAddress as string) ?? '',
    businessPhone: (m.businessPhone as string) ?? '',
    receiptFooter: (m.receiptFooter as string) ?? 'Thank you for your purchase!',
    customPriceMax: Number.isFinite(max) && max > 0 ? max : DEFAULT_CUSTOM_PRICE_MAX,
    allowStaffCustomPrice: m.allowStaffCustomPrice === undefined ? true : String(m.allowStaffCustomPrice) !== 'false',
    timezone: getTimezone(),
  };
}
