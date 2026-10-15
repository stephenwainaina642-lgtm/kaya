import 'dotenv/config';
import { z } from 'zod';

// On a deployed host (see render.yaml / scripts/deploy-setup.mjs) we only
// ever set DATABASE_ADMIN_URL + APP_DB_PASSWORD directly — DATABASE_URL
// (the RLS-scoped `kaya_app` connection) is derived here instead of being
// hand-typed into a dashboard, so there's nothing to configure manually
// after a fresh deploy.
if (!process.env.DATABASE_URL && process.env.DATABASE_ADMIN_URL && process.env.APP_DB_PASSWORD) {
  try {
    const url = new URL(process.env.DATABASE_ADMIN_URL);
    url.username = 'kaya_app';
    url.password = process.env.APP_DB_PASSWORD;
    process.env.DATABASE_URL = url.toString();
  } catch {
    // fall through — schema validation below will report the missing var
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  DATABASE_ADMIN_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  PLATFORM_JWT_SECRET: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.string().default('info'),
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
