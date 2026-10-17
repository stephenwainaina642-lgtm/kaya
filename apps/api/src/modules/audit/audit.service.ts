import { desc, eq, sql as dsql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuditLogPage } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { auditLogs, users } from '../../db/schema';
import { type Auth, pagingQuery, pageWindow } from '../crm/common';

export const auditLogQuery = pagingQuery;

export async function listAuditLog(a: Auth, q: z.infer<typeof auditLogQuery>): Promise<AuditLogPage> {
  return withTenant(a.organizationId, async (tx) => {
    const { limit, offset } = pageWindow(q);
    const rows = await tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        summary: auditLogs.summary,
        createdAt: auditLogs.createdAt,
        actorId: users.id,
        actorName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(eq(auditLogs.organizationId, a.organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await tx
      .select({ c: dsql<number>`count(*)::int` })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, a.organizationId));

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        actor: r.actorId && r.actorName ? { id: r.actorId, name: r.actorName } : null,
        createdAt: r.createdAt.toISOString(),
      })),
      total: totalRow?.c ?? rows.length,
    };
  });
}
