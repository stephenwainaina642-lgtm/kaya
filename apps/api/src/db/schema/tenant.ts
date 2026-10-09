import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
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
  ...timestamps(),
});
