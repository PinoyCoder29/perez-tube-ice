import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  APP_URL: z.string().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  BUSINESS_TIMEZONE: z.string().default('Asia/Manila'),
});

let cached: z.infer<typeof schema> | null = null;

/** Validated server environment. Called lazily so `next build` works without secrets. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid environment configuration: ${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}
