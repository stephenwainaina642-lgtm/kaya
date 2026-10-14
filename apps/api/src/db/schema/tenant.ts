import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { planEnum } from './enums';
import { timestamps } from './base';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: planEnum('plan').notNull().default('STARTER'),
  timezone: text('timezone').notNull().default('Africa/Nairobi'),
  currency: text('currency').notNull().default('KES'),
  logoUrl: text('logo_url'),
  phone: text('phone'),
  // Set by a platform admin to lock an agency out of signing in without
  // deleting its data. Null means active.
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  ...timestamps(),
});
