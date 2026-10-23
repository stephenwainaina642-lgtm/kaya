// Shared account-lockout policy for both the agency login (auth.service.ts)
// and the platform-admin login (platform-admin.service.ts). Deliberately
// simple: a flat counter + a cooldown window, stored on the user/admin row
// itself so it survives restarts and works correctly even if the API ever
// runs as more than one instance (unlike an in-memory counter).

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export function isLocked(lockedUntil: Date | null): boolean {
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

/**
 * Call after a wrong-password attempt. Returns the counter/lock state to
 * persist: once `currentAttempts` reaches the threshold, the account locks
 * for LOCKOUT_MS and the counter resets, so the next failed attempt after
 * the lock expires starts counting from zero again rather than
 * immediately re-locking.
 */
export function recordFailedAttempt(currentAttempts: number): { failedLoginAttempts: number; lockedUntil: Date | null } {
  const attempts = currentAttempts + 1;
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) };
  }
  return { failedLoginAttempts: attempts, lockedUntil: null };
}

export const clearLockout = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
