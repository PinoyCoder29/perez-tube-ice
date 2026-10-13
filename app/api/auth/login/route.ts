import { prisma } from '@/lib/db/prisma';
import { route, parseJson } from '@/lib/api';
import { HttpError } from '@/lib/errors';
import { loginBody } from '@/lib/validation';
import { createSession, fakeVerify, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

export const POST = route(async (req) => {
  const { username, password } = await parseJson(req, loginBody);
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  const key = `${ip}|${username.toLowerCase()}`;
  const since = new Date(Date.now() - WINDOW_MS);

  const failures = await prisma.loginAttempt.count({ where: { key, success: false, createdAt: { gte: since } } });
  if (failures >= MAX_FAILURES) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && user.role === 'ADMIN' && user.active && user.passwordHash ? await verifyPassword(password, user.passwordHash) : (await fakeVerify(password), false);
  if (!ok || !user) {
    await prisma.loginAttempt.create({ data: { key, success: false } });
    throw new HttpError(401, 'Incorrect username or password.');
  }

  await prisma.loginAttempt.deleteMany({ where: { key } });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await createSession(user.id);
  await audit(prisma, { actorId: user.id, action: 'ADMIN_LOGIN', entityType: 'User', entityId: user.id });
  return { ok: true, mustChangePassword: user.mustChangePassword };
});
