import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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
  ...timestamps(),
});
