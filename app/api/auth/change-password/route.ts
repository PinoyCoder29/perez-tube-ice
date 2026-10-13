import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { changePasswordBody } from '@/lib/validation';
import { createSession, hashPassword, requireAdmin, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const POST = route(async (req) => {
  const admin = await requireAdmin({ allowPasswordChange: true });
  const { currentPassword, newPassword } = await parseJson(req, changePasswordBody);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect.');
  if (currentPassword === newPassword) throw new HttpError(400, 'Choose a different password.');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } });
  // Invalidate every existing session, then start a fresh one for this browser.
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  await audit(prisma, { actorId: user.id, action: 'PASSWORD_CHANGE', entityType: 'User', entityId: user.id });
  return { ok: true };
});
