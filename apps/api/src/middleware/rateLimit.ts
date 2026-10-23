import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env';

// Skipped entirely under test: the suite drives hundreds of requests
// through a handful of long-lived `createApp()` instances, and a shared
// in-memory counter would make unrelated tests fail depending on run
// order rather than on anything they actually assert.
const skipInTest = () => env.NODE_ENV === 'test';

/**
 * Generic ceiling across every API route — blunt protection against
 * scraping and basic denial-of-service, not a substitute for the
 * endpoint-specific limiter below.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

/**
 * A fresh login limiter instance (its own in-memory store, keyed by IP).
 * Exposed as a factory rather than one shared singleton so each login
 * route (agency, platform-admin) gets its own independent bucket, and so
 * tests can spin up a throwaway instance with a low `limit` to exercise
 * the 429 path without touching — or being affected by — the real
 * production limiters' counters.
 *
 * This caps how many password guesses one IP can throw at *any* account
 * in the window; the per-account lockout in auth.service.ts /
 * platform-admin.service.ts is what stops someone grinding through
 * passwords for one specific user once they rotate IPs.
 */
export function createLoginLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
    ...overrides,
  });
}
