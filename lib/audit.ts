import type { DB } from '@/lib/db/prisma';

const toJson = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

export async function audit(
  db: DB,
  e: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; previousValues?: unknown; newValues?: unknown },
) {
  await db.auditLog.create({
    data: {
      actorId: e.actorId ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      previousValues: e.previousValues === undefined ? undefined : toJson(e.previousValues),
      newValues: e.newValues === undefined ? undefined : toJson(e.newValues),
    },
  });
}
