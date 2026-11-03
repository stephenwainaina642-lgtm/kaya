import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import { planEnum } from './enums';
import { users } from './identity';
import { tenantColumns } from './tenant-ref';

// One row per M-Pesa checkout attempt. Status is plain text (PENDING/PAID/
// FAILED) rather than a pg enum: one fewer object for the deploy push to
// get wrong. The callback arrives with no tenant context, so it is matched
// by checkoutRequestId through systemDb; tenant reads go through RLS.
export const billingPayments = pgTable('billing_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  plan: planEnum('plan').notNull(),
  months: integer('months').notNull(),
  seats: integer('seats').notNull(),
  amount: integer('amount').notNull(),
  phone: text('phone').notNull(),
  status: text('status').notNull().default('PENDING'),
  merchantRequestId: text('merchant_request_id'),
  checkoutRequestId: text('checkout_request_id').unique(),
  mpesaReceipt: text('mpesa_receipt'),
  failureReason: text('failure_reason'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});
