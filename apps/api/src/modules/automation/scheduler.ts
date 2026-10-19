import { sweepDripEnrollments } from './drip.service';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes — fine-grained enough for hour-scale
// drip offsets, and cheap: the sweep only does real work (a follow_up insert) for
// enrollments whose next step is actually due.

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the in-process drip-sequence scheduler. No external queue or cron
 * infra — just a periodic sweep over every organization's active
 * enrollments (see drip.service.sweepDripEnrollments). Call once from
 * server.ts; safe to call again (it no-ops if already running), and a
 * failed sweep is logged and retried on the next tick rather than crashing
 * the process.
 */
export function startDripScheduler(): void {
  if (timer) return;
  const runSweep = () => {
    sweepDripEnrollments().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[drip-scheduler] sweep failed:', err);
    });
  };
  timer = setInterval(runSweep, SWEEP_INTERVAL_MS);
  timer.unref?.(); // don't keep the process alive just for this timer
  runSweep(); // also run once immediately on startup, not just after the first interval
}

export function stopDripScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
