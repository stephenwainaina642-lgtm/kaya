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
