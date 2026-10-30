import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';
import { timestamps } from './base';
import { tenantColumns } from './tenant-ref';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('AGENT'),
  jobTitle: text('job_title'),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  // Consecutive failed logins since the last success; reset to 0 on a
  // successful login. Used to lock the account out for a cooldown after
  // too many wrong passwords in a row — see auth.service.ts.
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  ...timestamps(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// No tenantColumns, same as refreshTokens above — looked up by tokenHash
// alone via systemDb, since a password-reset request arrives before any
// tenant/auth context exists. One row per outstanding reset request;
// usedAt marks it spent so a link can't be replayed after a successful
// reset, and a fresh "forgot password" request supersedes any earlier one
// (see auth.service.ts, which deletes prior rows for the user first).
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
