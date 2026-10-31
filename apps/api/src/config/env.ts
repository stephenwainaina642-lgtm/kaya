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
  // Optional — AI features (lead scoring, drafted messages, summaries) are
  // gated off gracefully (see lib/ai.ts) when this isn't set, rather than
  // the server failing to start.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Optional — transactional email (password resets) goes out through
  // Resend (https://resend.com) when this is set. Without it, emails are
  // not delivered; see lib/mailer.ts.
  RESEND_API_KEY: z.string().optional(),
  // Resend's shared sandbox sender works for testing; set this to an
  // address on a domain you've verified in Resend for real delivery.
  MAIL_FROM: z.string().default('Kaya <onboarding@resend.dev>'),
  // Optional — durable file storage (logos, documents) in any S3-compatible
  // bucket (Cloudflare R2, AWS S3, ...). Without these, files go to the
  // server's local disk, which Render wipes on every deploy.
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Public URL of the web app, used to build links inside emails.
  APP_URL: z.string().optional(),
});

export const env = schema.parse(process.env);

export const appUrl = (env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? env.CORS_ORIGINS.split(',')[0] ?? 'http://localhost:5173').trim().replace(/\/$/, '');

export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
