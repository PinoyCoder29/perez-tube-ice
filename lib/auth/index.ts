import crypto from 'crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { env } from '@/lib/env';
import { HttpError } from '@/lib/errors';

export const SESSION_COOKIE = 'perez_session';
export const STAFF_USERNAME = 'staff';
const SESSION_HOURS = 8;

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'STAFF';
  mustChangePassword: boolean;
}

const hashToken = (t: string) => crypto.createHmac('sha256', env().SESSION_SECRET).update(t).digest('hex');

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

let dummyHash: string | null = null;
/** Burn comparable time when the username does not exist (avoids user enumeration by timing). */
export async function fakeVerify(pw: string) {
  dummyHash ??= bcrypt.hashSync('not-a-real-password', 12);
  await bcrypt.compare(pw, dummyHash);
}

/** Route handlers only (sets a cookie). */
export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active || s.user.role !== 'ADMIN') return null;
  const u = s.user;
  return { id: u.id, name: u.name, username: u.username, role: u.role, mustChangePassword: u.mustChangePassword };
}

/** Admin session that has completed the forced password change; otherwise null (treated like anonymous Staff). */
export async function getFullAdmin(): Promise<SessionUser | null> {
  const u = await getSessionUser();
  return u && !u.mustChangePassword ? u : null;
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookies().delete(SESSION_COOKIE);
}

/** Server-side Admin gate used by every admin endpoint. */
export async function requireAdmin(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, 'Please log in as Admin.');
  if (u.role !== 'ADMIN') throw new HttpError(403, 'Admin access required.');
  if (u.mustChangePassword && !opts.allowPasswordChange) throw new HttpError(403, 'You must change your password first.');
  return u;
}

export interface Actor {
  id: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
}

/**
 * Identity recorded on staff-level actions. A logged-in Admin acts as themselves;
 * everyone else is the shared passwordless Staff identity.
 */
export async function getActor(): Promise<Actor> {
  const u = await getSessionUser();
  if (u && !u.mustChangePassword) return { id: u.id, name: u.name, role: u.role };
  const staff = await prisma.user.findUnique({ where: { username: STAFF_USERNAME } });
  if (!staff || !staff.active) throw new HttpError(503, 'Staff identity is not set up. Run the database seed.');
  return { id: staff.id, name: staff.name, role: 'STAFF' };
}
