import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ZodError, type ZodTypeDef, type ZodType } from 'zod';
import { HttpError } from '@/lib/errors';

type Ctx = { params: Record<string, string> };
type Handler = (req: NextRequest, ctx: Ctx) => Promise<unknown>;

function assertSameOrigin(req: NextRequest) {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (origin && host) {
    let ok = false;
    try {
      ok = new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError(403, 'Cross-site request blocked.');
  } else if (req.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Cross-site request blocked.');
  }
}

/** Wraps a route handler: origin check, JSON serialisation, uniform error responses. */
export function route(handler: Handler) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      assertSameOrigin(req);
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        const msg = e.issues
          .slice(0, 3)
          .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
          .join('; ');
        return NextResponse.json({ error: msg || 'Invalid request' }, { status: 400 });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') return NextResponse.json({ error: 'That record already exists.' }, { status: 409 });
        if (e.code === 'P2025') return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
      }
      console.error('[api error]', req.method, req.nextUrl.pathname, e);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  };
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
  return schema.parse(raw);
}

export const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export function intParam(v: string | null, def: number, min: number, max: number) {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
}
