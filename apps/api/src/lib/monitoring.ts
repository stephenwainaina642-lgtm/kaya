import * as Sentry from '@sentry/node';
import { env } from '../config/env';

let enabled = false;

/** Call once at startup. A no-op unless SENTRY_DSN is set. */
export function initMonitoring(): void {
  if (!env.SENTRY_DSN || env.NODE_ENV === 'test') return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0 });
  enabled = true;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('request', context);
    Sentry.captureException(err);
  });
}

export async function flushMonitoring(): Promise<void> {
  if (enabled) await Sentry.flush(2000);
}
