import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { leadSourceEnum, contactMethodEnum, followUpPriorityEnum } from './enums';
import { timestamps } from './base';
import { tenantColumns } from './tenant-ref';
import { auditColumns } from './audit-ref';
import { users } from './identity';
import { leads, clients } from './crm';

// Kept local to this file (not packages/shared/enums.ts) since these are
// internal implementation detail of the automation engine, not something
// any form field or filter directly renders as a plain enum select.
export const assignStrategyEnum = pgEnum('assign_strategy', ['ROUND_ROBIN', 'SPECIFIC_AGENT']);
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['ACTIVE', 'COMPLETED', 'CANCELLED']);
export const dripTriggerEnum = pgEnum('drip_trigger', ['LEAD_CREATED']);

/**
 * Rule-based auto-assignment of newly created leads. Evaluated in `priority`
 * order (lowest first); the first active rule whose sourceFilter matches (or
 * is null, meaning "any source") wins. Only applies when the lead was
 * created without an explicit assignedAgentId — see
 * modules/automation/rules.service.ts.
 */
export const automationRules = pgTable('automation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  priority: integer('priority').notNull().default(100),
  sourceFilter: leadSourceEnum('source_filter'),
  strategy: assignStrategyEnum('strategy').notNull(),
  specificAgentId: uuid('specific_agent_id').references(() => users.id, { onDelete: 'set null' }),
  // Array of user ids for ROUND_ROBIN, stored as jsonb rather than a
  // Postgres array so the API can validate/rewrite it as a simple JSON list.
  agentPool: jsonb('agent_pool').notNull().default(sql`'[]'::jsonb`),
  roundRobinCursor: integer('round_robin_cursor').notNull().default(0),
  ...auditColumns(),
  ...timestamps(),
});

/** A drip follow-up sequence: a named, reusable set of timed touchpoints. */
export const dripSequences = pgTable('drip_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  trigger: dripTriggerEnum('trigger').notNull().default('LEAD_CREATED'),
  sourceFilter: leadSourceEnum('source_filter'),
  ...auditColumns(),
  ...timestamps(),
});

/** One timed step within a sequence. Scoped to its parent (no organizationId
 * of its own) — RLS is inherited through the sequenceId join, same pattern
 * as property_images/property_features. */
export const dripSequenceSteps = pgTable('drip_sequence_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id').notNull().references(() => dripSequences.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),
  offsetHours: integer('offset_hours').notNull(),
  title: text('title').notNull(),
  notes: text('notes'),
  channel: contactMethodEnum('channel'),
  priority: followUpPriorityEnum('priority').notNull().default('MEDIUM'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One contact's run through a sequence. `cursorStep` is the index of the
 * next step not yet materialized into a follow-up — the automation sweep
 * (modules/automation/scheduler.ts) advances it as each step's offset
 * elapses, so steps appear as their due time arrives rather than all at
 * once, matching real drip-campaign behavior.
 */
export const dripEnrollments = pgTable('drip_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  sequenceId: uuid('sequence_id').notNull().references(() => dripSequences.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  status: enrollmentStatusEnum('status').notNull().default('ACTIVE'),
  cursorStep: integer('cursor_step').notNull().default(0),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});
