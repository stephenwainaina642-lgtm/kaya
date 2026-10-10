import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
