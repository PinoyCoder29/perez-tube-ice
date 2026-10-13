import { prisma } from '@/lib/db/prisma';
import { route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';

export const GET = route(async () => {
  await requireAdmin();
  return prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } });
});
