import { sweepLeaseExpiry, sweepRentCharges } from './rent.service';

const INTERVAL_MS = 60 * 60 * 1000; // hourly: rent is a monthly event, this only needs to be timely, not fast
let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the in-process rent scheduler. Idempotent; a failed run is logged and retried next hour. */
export function startRentScheduler(): void {
  if (timer) return;
  const run = () => {
    sweepRentCharges().catch((err) => console.error('[rent-scheduler] sweep failed:', err));
    sweepLeaseExpiry().catch((err) => console.error('[rent-scheduler] expiry sweep failed:', err));
  };
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
  run(); // catch up immediately after a deploy or restart
}

export function stopRentScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
