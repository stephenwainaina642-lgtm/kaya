import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import type { CommissionListItem, CommissionPage } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { commissions, deals, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, pagingQuery, pageWindow, agentRef } from '../crm/common';

export const paymentInput = z.object({
  amount: z.number().min(0),
});

export const commissionListQuery = pagingQuery.extend({
  status: z.enum(['PENDING', 'INVOICED', 'PAID', 'PARTIALLY_PAID']).optional(),
  agentId: uuidField.optional(),
});

export async function listCommissions(a: Auth, query: unknown): Promise<CommissionPage> {
  const q = parse(commissionListQuery, query);
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx
      .select({
        id: commissions.id,
        dealId: commissions.dealId,
        dealNumber: deals.dealNumber,
        dealName: deals.name,
        agentId: commissions.agentId,
        agentName: users.name,
        amount: commissions.amount,
        paidAmount: commissions.paidAmount,
        status: commissions.status,
        earnedAt: commissions.earnedAt,
        paidAt: commissions.paidAt,
      })
      .from(commissions)
      .innerJoin(deals, eq(deals.id, commissions.dealId))
      .innerJoin(users, eq(users.id, commissions.agentId))
      .where(eq(deals.organizationId, a.organizationId))
      .orderBy(desc(commissions.earnedAt));

    const filtered = rows.filter((r) => (!q.status || r.status === q.status) && (!q.agentId || r.agentId === q.agentId));
    const { limit, offset } = pageWindow(q);
    const items: CommissionListItem[] = filtered.slice(offset, offset + limit).map((r) => ({
      id: r.id,
      dealNumber: r.dealNumber,
      dealName: r.dealName,
      agent: agentRef(r.agentId, r.agentName)!,
      amount: r.amount,
      paidAmount: r.paidAmount,
      status: r.status,
      earnedAt: r.earnedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    }));

    return {
      items,
      total: filtered.length,
      totalOutstanding: filtered.reduce((sum, r) => sum + (r.amount - r.paidAmount), 0),
      totalPaid: filtered.reduce((sum, r) => sum + r.paidAmount, 0),
    };
  });
}

export async function recordPayment(a: Auth, id: string, body: unknown): Promise<void> {
  parse(uuidField, id);
  const input = parse(paymentInput, body);
  await withTenant(a.organizationId, async (tx) => {
    const [row] = await tx
      .select({ c: commissions, orgId: deals.organizationId })
      .from(commissions)
      .innerJoin(deals, eq(deals.id, commissions.dealId))
      .where(and(eq(commissions.id, id), eq(deals.organizationId, a.organizationId)));
    if (!row) throw notFound('Commission');

    const paidAmount = row.c.paidAmount + input.amount;
    const status = paidAmount >= row.c.amount ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : row.c.status;
    await tx
      .update(commissions)
      .set({ paidAmount, status, paidAt: status === 'PAID' ? new Date() : row.c.paidAt })
      .where(eq(commissions.id, id));
  });
}
