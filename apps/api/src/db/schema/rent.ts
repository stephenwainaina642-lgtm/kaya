import { pgTable, text, timestamp, uuid, integer, date, unique, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
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
  // Set once the "lease ending soon" follow-up has been raised, so it fires
  // once per term; cleared again when the lease is renewed.
  // Deposit settlement once the lease has ended: what is kept back for damage
  // or arrears; the refund is deposit_amount - deposit_deduction.
  depositDeduction: integer('deposit_deduction').notNull().default(0),
  depositSettledAt: timestamp('deposit_settled_at', { withTimezone: true }),
  depositNotes: text('deposit_notes'),
  expiryAlertSentAt: timestamp('expiry_alert_sent_at', { withTimezone: true }),
  // Secret in the tenant's read-only link. Null = no link; clearing or replacing it revokes the old one.
  portalToken: text('portal_token'),
  // When the tenant was last sent an SMS arrears reminder; used to avoid nagging.
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ portalTokenIdx: uniqueIndex('leases_portal_token_idx').on(t.portalToken) }));

export const rentCharges = pgTable('rent_charges', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  period: text('period').notNull(), // YYYY-MM
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  amount: integer('amount').notNull(),
  paidAmount: integer('paid_amount').notNull().default(0),
  status: text('status').notNull().default('UNPAID'),
  // Extra items (water, garbage, ...) already included in `amount`. Rent proper is amount minus these.
  extras: jsonb('extras').$type<{ id: string; label: string; amount: number }[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ onePerPeriod: unique('rent_charges_lease_period_key').on(t.leaseId, t.period) }));

/** A tenant says "I paid, here is the M-Pesa code"; an agent confirms it into a real payment. */
export const paymentClaims = pgTable('payment_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  mpesaCode: text('mpesa_code').notNull(),
  status: text('status').notNull().default('PENDING'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedById: uuid('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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

// An agency's own Daraja credentials, so tenants pay rent straight into the agency's till or paybill.
// Secrets are encrypted at rest (lib/secrets.ts) and never sent back to the browser.
export const orgMpesa = pgTable('org_mpesa', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  mode: text('mode').notNull().default('sandbox'),
  accountType: text('account_type').notNull().default('PAYBILL'),
  shortcode: text('shortcode').notNull(),
  consumerKey: text('consumer_key').notNull(),
  consumerSecretEnc: text('consumer_secret_enc').notNull(),
  passkeyEnc: text('passkey_enc').notNull(),
  callbackSecret: text('callback_secret').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ orgIdx: uniqueIndex('org_mpesa_org_idx').on(t.organizationId), callbackIdx: uniqueIndex('org_mpesa_callback_idx').on(t.callbackSecret) }));

// One M-Pesa prompt sent to a tenant's phone from their portal, and how it ended.
export const rentStkRequests = pgTable('rent_stk_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  leaseId: uuid('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  phone: text('phone').notNull(),
  checkoutRequestId: text('checkout_request_id').notNull(),
  status: text('status').notNull().default('PENDING'),
  resultDesc: text('result_desc'),
  receipt: text('receipt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp('settled_at', { withTimezone: true }),
}, (t) => ({ checkoutIdx: uniqueIndex('rent_stk_checkout_idx').on(t.checkoutRequestId) }));
