import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { planEnum } from './enums';
import { timestamps } from './base';

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: planEnum('plan').notNull().default('STARTER'),
  // When the paid plan lapses. Null = never expires (platform-admin comped
  // plans, demo orgs); STARTER ignores it. See effectivePlan() in @kaya/shared.
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
  // Automatic monthly landlord statements: the day of the month (1-28) to send last month's
  // statements, or null for off. The last period sent makes each month fire exactly once.
  statementEmailDay: integer('statement_email_day'),
  statementEmailLastPeriod: text('statement_email_last_period'),
  timezone: text('timezone').notNull().default('Africa/Nairobi'),
  currency: text('currency').notNull().default('KES'),
  logoUrl: text('logo_url'),
  // Hex color (e.g. "#2F5D4E") an org admin can set to theme their workspace
  // and public-facing pages (inquiry form, shortlist links). Null = use
  // Kaya's default cypress/brass palette.
  brandColor: text('brand_color'),
  phone: text('phone'),
  // Set when an org admin dismisses the dashboard's getting-started checklist.
  onboardingDismissedAt: timestamp('onboarding_dismissed_at', { withTimezone: true }),
  // Set by a platform admin to lock an agency out of signing in without
  // deleting its data. Null means active.
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  ...timestamps(),
});
