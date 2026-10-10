import { uuid } from 'drizzle-orm/pg-core';
import { users } from './identity';

// Split out of base.ts to avoid a circular import (see the comment there).
// identity.ts itself never calls auditColumns(), so this one-directional
// import (audit-ref -> identity) introduces no cycle.
export function auditColumns() {
  return {
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  };
}
