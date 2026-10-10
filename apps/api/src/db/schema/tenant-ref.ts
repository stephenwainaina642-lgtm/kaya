import { uuid } from 'drizzle-orm/pg-core';
import { organizations } from './tenant';

// Split out of base.ts to avoid a circular import (see the comment there).
export function tenantColumns() {
  return {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
  };
}
