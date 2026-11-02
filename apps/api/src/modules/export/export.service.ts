import { getTableColumns, type AnyColumn } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { withTenant } from '../../db/client';
import { leads, clients, owners, properties } from '../../db/schema';
import { recordAudit } from '../../lib/audit';
import { toCsv } from '../../lib/csv';
import { notFound } from '../../lib/errors';
import { type Auth } from '../crm/common';

const ENTITIES = { leads, clients, owners, properties } as const;
export type ExportEntity = keyof typeof ENTITIES;
export const EXPORT_ENTITIES = Object.keys(ENTITIES) as ExportEntity[];

// Internal plumbing that means nothing outside the database.
const HIDDEN = new Set(['organizationId']);

/**
 * Every column of the entity for the caller's own agency (row-level
 * security scopes the query), as CSV. Recorded in the audit log: a full
 * data export is exactly the kind of action an owner wants a trail for.
 */
export async function exportEntity(a: Auth, entity: string): Promise<{ filename: string; csv: string }> {
  if (!(EXPORT_ENTITIES as string[]).includes(entity)) throw notFound('Export');
  const table = ENTITIES[entity as ExportEntity] as PgTable;
  const columns = Object.entries(getTableColumns(table) as Record<string, AnyColumn>).filter(([key]) => !HIDDEN.has(key));

  const rows = await withTenant(a.organizationId, async (tx) => {
    const data = await tx.select().from(table);
    await recordAudit(tx, {
      organizationId: a.organizationId,
      actorId: a.userId,
      action: 'EXPORT',
      entityType: entity,
      entityId: a.organizationId,
      summary: `Exported ${data.length} ${entity} as CSV`,
    });
    return data as Record<string, unknown>[];
  });

  const csv = toCsv(columns.map(([key]) => key), rows);
  const date = new Date().toISOString().slice(0, 10);
  return { filename: `kaya-${entity}-${date}.csv`, csv };
}
