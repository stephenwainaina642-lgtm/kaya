import { eq, and, lt, gte, sql as dsql, desc } from 'drizzle-orm';
import type { DashboardData, ScheduleItem } from '@kaya/shared';
import { ATTENTION_BASE_SCORE, DEAL_STALLED_AFTER_DAYS, effectiveDealValue, startOfMonth, addMonths, monthKey } from '@kaya/shared';
import { withTenant } from '../../db/client';
import {
  leads, clients, viewings, deals, followUps, tasks, commissions, users, properties,
} from '../../db/schema';
import { type Auth, orgTimezone } from '../crm/common';

export async function getDashboard(a: Auth): Promise<DashboardData> {
  return withTenant(a.organizationId, async (tx) => {
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60000);
    const monthStart = startOfMonth(now);

    const [activeLeadsRow] = await tx.select({ c: dsql<number>`count(*)::int` }).from(leads)
      .where(and(eq(leads.organizationId, a.organizationId), dsql`${leads.status} not in ('WON','LOST')`));
    const [activeClientsRow] = await tx.select({ c: dsql<number>`count(*)::int` }).from(clients)
      .where(and(eq(clients.organizationId, a.organizationId), eq(clients.status, 'ACTIVE')));
    const [viewingsWeekRow] = await tx.select({ c: dsql<number>`count(*)::int` }).from(viewings)
      .where(and(eq(viewings.organizationId, a.organizationId), gte(viewings.scheduledAt, now), lt(viewings.scheduledAt, weekAhead)));
    const openDeals = await tx.select().from(deals).where(and(eq(deals.organizationId, a.organizationId), eq(deals.status, 'OPEN')));
    const [wonThisMonthRow] = await tx.select({ c: dsql<number>`count(*)::int` }).from(deals)
      .where(and(eq(deals.organizationId, a.organizationId), eq(deals.status, 'WON'), gte(deals.updatedAt, monthStart)));
    const commissionRows = await tx.select({ amount: commissions.amount, earnedAt: commissions.earnedAt }).from(commissions)
      .innerJoin(deals, eq(deals.id, commissions.dealId))
      .where(and(eq(deals.organizationId, a.organizationId), gte(commissions.earnedAt, monthStart)));

    const kpis = {
      activeLeads: activeLeadsRow?.c ?? 0,
      activeClients: activeClientsRow?.c ?? 0,
      viewingsThisWeek: viewingsWeekRow?.c ?? 0,
      dealsInProgress: openDeals.length,
      pipelineValue: openDeals.reduce((sum, d) => sum + effectiveDealValue(d), 0),
      commissionsEarnedThisMonth: commissionRows.reduce((sum, c) => sum + c.amount, 0),
      wonDealsThisMonth: wonThisMonthRow?.c ?? 0,
    };

    // Attention list
    const overdueFollowUps = await tx.select({ f: followUps, name: dsql<string>`coalesce(${leads.fullName}, ${clients.fullName})` })
      .from(followUps)
      .leftJoin(leads, eq(leads.id, followUps.leadId))
      .leftJoin(clients, eq(clients.id, followUps.clientId))
      .where(and(eq(followUps.organizationId, a.organizationId), eq(followUps.status, 'PENDING'), lt(followUps.dueAt, now)))
      .limit(10);

    const stalledCutoff = new Date(now.getTime() - DEAL_STALLED_AFTER_DAYS * 24 * 60 * 60000);
    const stalledDeals = await tx.select().from(deals)
      .where(and(eq(deals.organizationId, a.organizationId), eq(deals.status, 'OPEN'), lt(deals.stageEnteredAt, stalledCutoff)))
      .limit(10);

    const unassignedLeads = await tx.select().from(leads)
      .where(and(eq(leads.organizationId, a.organizationId), dsql`${leads.assignedAgentId} is null`, dsql`${leads.status} not in ('WON','LOST')`))
      .limit(10);

    const overdueTasks = await tx.select().from(tasks)
      .where(and(eq(tasks.organizationId, a.organizationId), eq(tasks.status, 'OPEN'), lt(tasks.dueAt, now)))
      .limit(10);

    const attention = [
      ...overdueFollowUps.map((r) => ({
        id: r.f.id, kind: 'OVERDUE_FOLLOW_UP' as const, title: `Overdue follow-up: ${r.name ?? 'Contact'}`,
        subtitle: r.f.title, score: ATTENTION_BASE_SCORE + 5, link: `/follow-ups/${r.f.id}`,
      })),
      ...stalledDeals.map((d) => ({
        id: d.id, kind: 'STALLED_DEAL' as const, title: `Stalled deal: ${d.name}`,
        subtitle: `No movement for ${DEAL_STALLED_AFTER_DAYS}+ days`, score: ATTENTION_BASE_SCORE + 8, link: `/deals/${d.id}`,
      })),
      ...unassignedLeads.map((l) => ({
        id: l.id, kind: 'UNASSIGNED_LEAD' as const, title: `Unassigned lead: ${l.fullName}`,
        subtitle: l.source, score: ATTENTION_BASE_SCORE + 3, link: `/leads/${l.id}`,
      })),
      ...overdueTasks.map((t) => ({
        id: t.id, kind: 'OVERDUE_TASK' as const, title: `Overdue task: ${t.title}`,
        subtitle: null, score: ATTENTION_BASE_SCORE + 2, link: `/tasks/${t.id}`,
      })),
    ].sort((x, y) => y.score - x.score).slice(0, 15);

    // Schedule (next 7 days)
    const viewingRows = await tx.select({ v: viewings, propTitle: properties.title }).from(viewings)
      .innerJoin(properties, eq(properties.id, viewings.propertyId))
      .where(and(eq(viewings.organizationId, a.organizationId), gte(viewings.scheduledAt, now), lt(viewings.scheduledAt, weekAhead)));
    const followUpRows = await tx.select().from(followUps)
      .where(and(eq(followUps.organizationId, a.organizationId), eq(followUps.status, 'PENDING'), gte(followUps.dueAt, now), lt(followUps.dueAt, weekAhead)));
    const taskRows = await tx.select().from(tasks)
      .where(and(eq(tasks.organizationId, a.organizationId), eq(tasks.status, 'OPEN'), gte(tasks.dueAt, now), lt(tasks.dueAt, weekAhead)));

    const schedule: ScheduleItem[] = [
      ...viewingRows.map((r) => ({
        id: r.v.id, type: 'VIEWING' as const, title: `Viewing: ${r.propTitle}`, subtitle: r.v.meetingLocation,
        at: r.v.scheduledAt.toISOString(), status: r.v.status, link: `/viewings/${r.v.id}`,
      })),
      ...followUpRows.map((r) => ({
        id: r.id, type: 'FOLLOW_UP' as const, title: r.title, subtitle: null,
        at: r.dueAt.toISOString(), status: r.status, link: `/follow-ups/${r.id}`,
      })),
      ...taskRows.map((r) => ({
        id: r.id, type: 'TASK' as const, title: r.title, subtitle: null,
        at: (r.dueAt ?? now).toISOString(), status: r.status, link: `/tasks/${r.id}`,
      })),
    ].sort((x, y) => x.at.localeCompare(y.at));

    const leadSourceRows = await tx.select({ source: leads.source, c: dsql<number>`count(*)::int` }).from(leads)
      .where(eq(leads.organizationId, a.organizationId)).groupBy(leads.source);

    const pipelineRows = await tx.select({ status: leads.status, c: dsql<number>`count(*)::int` }).from(leads)
      .where(eq(leads.organizationId, a.organizationId)).groupBy(leads.status);

    const sixMonthsAgo = addMonths(monthStart, -5);
    const trendCommissions = await tx.select({ amount: commissions.amount, earnedAt: commissions.earnedAt }).from(commissions)
      .innerJoin(deals, eq(deals.id, commissions.dealId))
      .where(and(eq(deals.organizationId, a.organizationId), gte(commissions.earnedAt, sixMonthsAgo)));
    const trendDeals = await tx.select({ actualCloseDate: deals.actualCloseDate, updatedAt: deals.updatedAt }).from(deals)
      .where(and(eq(deals.organizationId, a.organizationId), eq(deals.status, 'WON'), gte(deals.updatedAt, sixMonthsAgo)));

    const trendMap = new Map<string, { commissionEarned: number; dealsWon: number }>();
    for (let i = 0; i < 6; i++) {
      trendMap.set(monthKey(addMonths(sixMonthsAgo, i)), { commissionEarned: 0, dealsWon: 0 });
    }
    for (const c of trendCommissions) {
      if (!c.earnedAt) continue;
      const k = monthKey(c.earnedAt);
      const bucket = trendMap.get(k);
      if (bucket) bucket.commissionEarned += c.amount;
    }
    for (const d of trendDeals) {
      const k = monthKey(d.updatedAt);
      const bucket = trendMap.get(k);
      if (bucket) bucket.dealsWon += 1;
    }
    const revenueTrend = Array.from(trendMap.entries()).map(([month, v]) => ({ month, ...v }));

    const agentRows = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.organizationId, a.organizationId));
    const agentPerformance = await Promise.all(agentRows.map(async (agent) => {
      const [activeLeadsCount] = await tx.select({ c: dsql<number>`count(*)::int` }).from(leads)
        .where(and(eq(leads.assignedAgentId, agent.id), dsql`${leads.status} not in ('WON','LOST')`));
      const [dealsWonCount] = await tx.select({ c: dsql<number>`count(*)::int` }).from(deals)
        .where(and(eq(deals.agentId, agent.id), eq(deals.status, 'WON')));
      const [commissionSum] = await tx.select({ sum: dsql<number>`coalesce(sum(${commissions.amount}),0)` }).from(commissions)
        .where(eq(commissions.agentId, agent.id));
      return {
        agent: { id: agent.id, name: agent.name },
        activeLeads: activeLeadsCount?.c ?? 0,
        dealsWon: dealsWonCount?.c ?? 0,
        commissionEarned: Number(commissionSum?.sum ?? 0),
      };
    }));

    return {
      kpis,
      attention,
      schedule,
      leadSources: leadSourceRows.map((r) => ({ source: r.source, count: r.c })),
      pipeline: pipelineRows.map((r) => ({ status: r.status, count: r.c })),
      revenueTrend,
      agentPerformance,
    };
  });
}
