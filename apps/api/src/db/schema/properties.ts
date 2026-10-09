import { pgTable, text, timestamp, uuid, doublePrecision, integer, boolean, jsonb, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  listingTypeEnum, propertyTypeEnum, segmentEnum, furnishingEnum, propertyStatusEnum,
  featureKindEnum, commissionArrangementEnum,
} from './enums';
import { tenantColumns, auditColumns, timestamps } from './base';
import { users } from './identity';
import { clients } from './crm';

export const owners = pgTable('owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  fullName: text('full_name'),
  companyName: text('company_name'),
  phone: text('phone').notNull(),
  email: text('email'),
  whatsapp: text('whatsapp'),
  agreementType: text('agreement_type'),
  agreementStart: text('agreement_start'),
  agreementEnd: text('agreement_end'),
  commissionArrangement: commissionArrangementEnum('commission_arrangement'),
  commissionRate: doublePrecision('commission_rate'),
  commissionFixedAmount: doublePrecision('commission_fixed_amount'),
  agreementNotes: text('agreement_notes'),
  notes: text('notes'),
  ...auditColumns(),
  ...timestamps(),
});

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  reference: text('reference').notNull(),
  title: text('title').notNull(),
  listingType: listingTypeEnum('listing_type').notNull(),
  propertyType: propertyTypeEnum('property_type').notNull(),
  segment: segmentEnum('segment').notNull().default('RESIDENTIAL'),
  price: doublePrecision('price').notNull(),
  currency: text('currency').notNull().default('KES'),
  location: text('location').notNull(),
  neighborhood: text('neighborhood'),
  city: text('city').notNull().default('Nairobi'),
  address: text('address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  sizeSqm: doublePrecision('size_sqm'),
  parkingSpaces: integer('parking_spaces'),
  furnishing: furnishingEnum('furnishing'),
  status: propertyStatusEnum('status').notNull().default('AVAILABLE'),
  availableFrom: text('available_from'),
  description: text('description'),
  videoUrl: text('video_url'),
  virtualTourUrl: text('virtual_tour_url'),
  internalNotes: text('internal_notes'),
  ownerId: uuid('owner_id').notNull().references(() => owners.id, { onDelete: 'restrict' }),
  assignedAgentId: uuid('assigned_agent_id').references(() => users.id, { onDelete: 'set null' }),
  listedAt: timestamp('listed_at', { withTimezone: true }),
  ...auditColumns(),
  ...timestamps(),
}, (t) => ({
  refUnique: unique('properties_org_reference_unique').on(t.organizationId, t.reference),
}));

export const propertyImages = pgTable('property_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  alt: text('alt'),
  isCover: boolean('is_cover').notNull().default(false),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const propertyFeatures = pgTable('property_features', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  label: text('label').notNull(),
  kind: featureKindEnum('kind').notNull().default('AMENITY'),
}, (t) => ({
  keyUnique: unique('property_features_property_key_unique').on(t.propertyId, t.key),
}));

export const clientPropertyMatches = pgTable('client_property_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  score: doublePrecision('score').notNull(),
  breakdown: jsonb('breakdown').notNull().default(sql`'{}'::jsonb`),
  dismissed: boolean('dismissed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pairUnique: unique('client_property_matches_pair_unique').on(t.clientId, t.propertyId),
}));

export const clientShortlists = pgTable('client_shortlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  shareToken: text('share_token').notNull().unique(),
  shareExpiresAt: timestamp('share_expires_at', { withTimezone: true }),
  ...auditColumns(),
  ...timestamps(),
});

export const shortlistItems = pgTable('shortlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  shortlistId: uuid('shortlist_id').notNull().references(() => clientShortlists.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  note: text('note'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pairUnique: unique('shortlist_items_pair_unique').on(t.shortlistId, t.propertyId),
}));
