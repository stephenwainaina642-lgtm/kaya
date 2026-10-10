import { sql } from 'drizzle-orm';
import { doublePrecision, timestamp, uuid } from 'drizzle-orm/pg-core';

// NOTE: this file deliberately has no imports from any other schema file.
// tenantColumns()/auditColumns() used to live here and import `organizations`
// / `users` to build their FK references, which created a real ESM import
// cycle (base -> tenant -> base, base -> identity -> base). That cycle
// happened to resolve under tsx/tsc's module order but broke under
// vitest's vite-node transform ("timestamps is not a function"). They now
// live in ./tenant-ref and ./audit-ref, each a one-directional import onto
// the table they reference, so nothing imports back into this file.

export const nowUtc = sql`now()`;

export function pk() {
  return uuid('id').primaryKey().defaultRandom();
}

export function money(name: string) {
  return doublePrecision(name);
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
