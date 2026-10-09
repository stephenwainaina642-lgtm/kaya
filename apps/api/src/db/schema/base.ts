import { sql } from 'drizzle-orm';
import { doublePrecision, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './tenant';
import { users } from './identity';

export const nowUtc = sql`now()`;

export function pk() {
  return uuid('id').primaryKey().defaultRandom();
}

export function money(name?: string) {
  return name ? doublePrecision(name) : doublePrecision();
}

export function tenantColumns() {
  return {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  };
}

export function auditColumns() {
  return {
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  };
}

export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}
