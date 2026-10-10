import { pgTable, text, timestamp, uuid, doublePrecision, integer, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  leadStatusEnum, leadSourceEnum, temperatureEnum, leadTypeEnum, clientStatusEnum,
  intentEnum, segmentEnum, furnishingEnum, propertyTypeEnum,
} from './enums';
import { tenantColumns, auditColumns, timestamps } from './base';
import { users } from './identity';

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  whatsapp: text('whatsapp'),
  email: text('email'),
  source: leadSourceEnum('source').notNull().default('OTHER'),
  status: leadStatusEnum('status').notNull().default('NEW'),
  temperature: temperatureEnum('temperature').notNull().default('WARM'),
  leadType: leadTypeEnum('lead_type').notNull().default('BUYER'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  notes: text('notes'),
  lostReason: text('lost_reason'),
  assignedAgentId: uuid('assigned_agent_id').references(() => users.id, { onDelete: 'set null' }),
  clientId: uuid('client_id'),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
  nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
  wonAt: timestamp('won_at', { withTimezone: true }),
  lostAt: timestamp('lost_at', { withTimezone: true }),
  ...auditColumns(),
  ...timestamps(),
});

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  whatsapp: text('whatsapp'),
  email: text('email'),
  status: clientStatusEnum('status').notNull().default('ACTIVE'),
  leadType: leadTypeEnum('lead_type').notNull().default('BUYER'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  notes: text('notes'),
  leadId: uuid('lead_id'),
  assignedAgentId: uuid('assigned_agent_id').references(() => users.id, { onDelete: 'set null' }),
  lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
  nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
  ...auditColumns(),
  ...timestamps(),
});

export const requirements = pgTable('requirements', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  intent: intentEnum('intent'),
  segment: segmentEnum('segment'),
  budgetMin: doublePrecision('budget_min'),
  budgetMax: doublePrecision('budget_max'),
  locations: text('locations').array().notNull().default(sql`'{}'::text[]`),
  propertyTypes: propertyTypeEnum('property_types').array().notNull().default(sql`'{}'::property_type[]`),
  bedroomsMin: integer('bedrooms_min'),
  bathroomsMin: integer('bathrooms_min'),
  parkingMin: integer('parking_min'),
  furnishing: furnishingEnum('furnishing'),
  amenities: text('amenities').array().notNull().default(sql`'{}'::text[]`),
  moveBy: text('move_by'),
  timeline: text('timeline'),
  notes: text('notes'),
  ...timestamps(),
}, (t) => ({
  oneOwner: check('requirements_one_owner', sql`(${t.leadId} is not null and ${t.clientId} is null) or (${t.leadId} is null and ${t.clientId} is not null)`),
}));
