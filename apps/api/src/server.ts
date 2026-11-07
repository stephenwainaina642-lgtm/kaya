import { storageBackend } from './lib/storage';
import { createApp } from './app';
import { env } from './config/env';
import { startDripScheduler } from './modules/automation/scheduler';
import { startRentScheduler } from './modules/rent/scheduler';
import { initMonitoring, captureError, flushMonitoring } from './lib/monitoring';
import { closeSystemPool } from './db/system';

initMonitoring();
const app = createApp();

if (env.NODE_ENV === 'production' && storageBackend() === 'local') {
  console.warn('[storage] *** Using local disk in production: uploaded logos and documents will be LOST on every deploy. Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (and S3_ENDPOINT for R2). ***');
}
const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Kaya API listening on :${env.PORT}`);
});

startDripScheduler();
startRentScheduler();

// A stray rejected promise must be reported, not silently ignored; and an
// uncaught exception leaves the process in an unknown state, so report it
// and exit — the host restarts a fresh process.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection', reason);
  captureError(reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception', err);
  captureError(err);
  void flushMonitoring().finally(() => process.exit(1));
});

// Render sends SIGTERM on every deploy: stop taking new requests, let
// in-flight ones finish, then close the database pool.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, draining`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    void closeSystemPool().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
