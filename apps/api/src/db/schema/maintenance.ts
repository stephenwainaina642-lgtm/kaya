import { pgTable, text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core';
import { clients } from './crm';
import { properties } from './properties';
import { users } from './identity';
import { tenantColumns } from './tenant-ref';

// Category/priority/status are plain text validated in the service (see
// schema/rent.ts for why). Costs are whole shillings.
export const maintenanceRequests = pgTable('maintenance_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  ...tenantColumns(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id').references(() => clients.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull().default('OTHER'),
  priority: text('priority').notNull().default('MEDIUM'),
  status: text('status').notNull().default('OPEN'),
  assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
  vendorName: text('vendor_name'),
  vendorPhone: text('vendor_phone'),
  estimatedCost: integer('estimated_cost'),
  actualCost: integer('actual_cost'),
  chargeToLandlord: boolean('charge_to_landlord').notNull().default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
