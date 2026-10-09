import { pgTable, text, timestamp, uuid, integer, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  activityTypeEnum, commChannelEnum, commDirectionEnum, commDeliveryEnum,
  documentTypeEnum, followUpStatusEnum, followUpPriorityEnum, contactMethodEnum,
  taskStatusEnum, taskPriorityEnum,
} from './enums';
import { tenantColumns, timestamps } from './base';
import { users } from './identity';
import { leads, clients } from './crm';
import { owners, properties } from './properties';
import { deals } from './sales';
import { viewings } from './sales';

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  type: activityTypeEnum('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
  viewingId: uuid('viewing_id').references(() => viewings.id, { onDelete: 'cascade' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const communications = pgTable('communications', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  channel: commChannelEnum('channel').notNull(),
  direction: commDirectionEnum('direction').notNull(),
  subject: text('subject'),
  body: text('body'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  durationSeconds: integer('duration_seconds'),
  deliveryStatus: commDeliveryEnum('delivery_status'),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').references(() => owners.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  name: text('name').notNull(),
  type: documentTypeEnum('type').notNull().default('OTHER'),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storageKey: text('storage_key').notNull(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').references(() => owners.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const followUps = pgTable('follow_ups', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  title: text('title').notNull(),
  notes: text('notes'),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  status: followUpStatusEnum('status').notNull().default('PENDING'),
  priority: followUpPriorityEnum('priority').notNull().default('MEDIUM'),
  channel: contactMethodEnum('channel'),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  title: text('title').notNull(),
  notes: text('notes'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  status: taskStatusEnum('status').notNull().default('OPEN'),
  priority: taskPriorityEnum('priority').notNull().default('MEDIUM'),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
