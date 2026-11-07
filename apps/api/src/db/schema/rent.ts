import { pgTable, text, timestamp, uuid, integer, date, unique } from 'drizzle-orm/pg-core';
import { clients } from './crm';
import { properties } from './properties';
import { users } from './identity';
import { tenantColumns } from './tenant-ref';

// Statuses/methods are plain text (validated in the service) rather than pg
// enums — one fewer object type for the deploy-time schema push to get wrong.
// Money is whole shillings; fee and withholding are basis points (1000 = 10%).

export const leases = pgTable('leases', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  rentAmount: integer('rent_amount').notNull(),
  depositAmount: integer('deposit_amount').notNull().default(0),
  dueDay: integer('due_day').notNull().default(1),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }),
  feeBps: integer('fee_bps').notNull().default(0),
  withholdingBps: integer('withholding_bps').notNull().default(0),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rentCharges = pgTable('rent_charges', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  period: text('period').notNull(), // YYYY-MM
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  amount: integer('amount').notNull(),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('UNPAID'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ onePerPeriod: unique('rent_charges_lease_period_key').on(t.leaseId, t.period) }));

export const rentPayments = pgTable('rent_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  chargeId: uuid('charge_id').notNull().references(() => rentCharges.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  method: text('method').notNull(),
  reference: text('reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  recordedById: uuid('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
