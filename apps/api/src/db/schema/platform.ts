import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './base';

/**
 * Platform operators — Anthropic/Kaya staff who manage agencies across the
 * whole platform. Deliberately NOT tenant-scoped (no organizationId) and
 * NOT subject to row-level security: this table sits outside the
 * multi-tenant boundary entirely, and every query against it goes through
 * the privileged systemDb connection rather than the per-tenant pool.
 */
export const platformAdmins = pgTable('platform_admins', {
  id: pk(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  // See users.failedLoginAttempts / lockedUntil in identity.ts — same
  // lockout mechanism, arguably more important here since this account
  // can touch every tenant.
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  ...timestamps(),
});
