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
