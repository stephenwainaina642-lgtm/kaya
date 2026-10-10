import { pgTable, text, timestamp, uuid, doublePrecision, integer, boolean, unique } from 'drizzle-orm/pg-core';
import {
  viewingStatusEnum, interestLevelEnum, dealTypeEnum, dealStatusEnum,
  offerPartyEnum, offerStatusEnum, commissionStatusEnum, paymentStatusEnum,
} from './enums';
import { timestamps } from './base';
import { tenantColumns } from './tenant-ref';
import { auditColumns } from './audit-ref';
import { users } from './identity';
import { leads, clients } from './crm';
import { owners, properties } from './properties';

export const viewings = pgTable('viewings', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  status: viewingStatusEnum('status').notNull().default('SCHEDULED'),
  meetingLocation: text('meeting_location'),
  notes: text('notes'),
  reminderMinutesBefore: integer('reminder_minutes_before').default(60),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...auditColumns(),
  ...timestamps(),
});

export const viewingFeedback = pgTable('viewing_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  viewingId: uuid('viewing_id').notNull().references(() => viewings.id, { onDelete: 'cascade' }).unique(),
  interestLevel: interestLevelEnum('interest_level').notNull(),
  rating: integer('rating'),
  feedback: text('feedback'),
  objections: text('objections'),
  nextAction: text('next_action'),
  followUpDate: text('follow_up_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dealStages = pgTable('deal_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  probability: integer('probability').notNull().default(0),
  isWon: boolean('is_won').notNull().default(false),
  isLost: boolean('is_lost').notNull().default(false),
}, (t) => ({
  keyUnique: unique('deal_stages_org_key_unique').on(t.organizationId, t.key),
}));

export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  dealNumber: text('deal_number').notNull(),
  name: text('name').notNull(),
  dealType: dealTypeEnum('deal_type').notNull(),
  status: dealStatusEnum('status').notNull().default('OPEN'),
  stageId: uuid('stage_id').notNull().references(() => dealStages.id, { onDelete: 'restrict' }),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  ownerId: uuid('owner_id').references(() => owners.id, { onDelete: 'set null' }),
  agentId: uuid('agent_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  dealValue: doublePrecision('deal_value').notNull(),
  commissionRate: doublePrecision('commission_rate'),
  commissionAmount: doublePrecision('commission_amount'),
  probability: integer('probability').notNull().default(0),
  offerPrice: doublePrecision('offer_price'),
  finalPrice: doublePrecision('final_price'),
  expectedCloseDate: text('expected_close_date'),
  actualCloseDate: text('actual_close_date'),
  lostReason: text('lost_reason'),
  notes: text('notes'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('UNPAID'),
  stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
  ...auditColumns(),
  ...timestamps(),
}, (t) => ({
  numberUnique: unique('deals_org_number_unique').on(t.organizationId, t.dealNumber),
}));

export const offers = pgTable('offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').notNull(),
  madeBy: offerPartyEnum('made_by').notNull(),
  status: offerStatusEnum('status').notNull().default('PENDING'),
  conditions: text('conditions'),
  notes: text('notes'),
  offeredAt: timestamp('offered_at', { withTimezone: true }).notNull().defaultNow(),
});

export const commissions = pgTable('commissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  sharePercent: doublePrecision('share_percent').notNull().default(100),
  amount: doublePrecision('amount').notNull(),
  paidAmount: doublePrecision('paid_amount').notNull().default(0),
  status: commissionStatusEnum('status').notNull().default('PENDING'),
  earnedAt: timestamp('earned_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});
