import { eq, and, inArray, isNotNull, sql as dsql } from 'drizzle-orm';
import type { AnalyticsData, LeadSource } from '@kaya/shared';
import { effectiveDealValue } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { leads, viewings, deals, commissions, users } from '../../db/schema';
import { type Auth } from '../crm/common';

function monthLabel(key: string): string {
  if (key === 'UNSCHEDULED') return 'Unscheduled';
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString('en-KE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export async function getAnalytics(a: Auth): Promise<AnalyticsData> {
  return withTenant(a.organizationId, async (tx) => {
    // --- Funnel: leads -> leads with a viewing -> leads that became a deal -> deals won ---
    const [totalLeadsRow] = await tx.select({ c: dsql<number>`count(*)::int` }).from(leads)
      .where(eq(leads.organizationId, a.organizationId));

    const [viewedLeadsRow] = await tx
      .select({ c: dsql<number>`count(distinct ${viewings.leadId})::int` })
      .from(viewings)
      .where(and(eq(viewings.organizationId, a.organizationId), isNotNull(viewings.leadId)));

    const [dealCreatedRow] = await tx
      .select({ c: dsql<number>`count(distinct ${deals.leadId})::int` })
      .from(deals)
      .where(and(eq(deals.organizationId, a.organizationId), isNotNull(deals.leadId)));

    const [wonFromLeadRow] = await tx
      .select({ c: dsql<number>`count(distinct ${deals.leadId})::int` })
      .from(deals)
      .where(and(eq(deals.organizationId, a.organizationId), eq(deals.status, 'WON'), isNotNull(deals.leadId)));

    const funnel: AnalyticsData['funnel'] = [
      { key: 'LEADS', label: 'Leads', count: totalLeadsRow?.c ?? 0 },
      { key: 'VIEWED', label: 'Had a viewing', count: viewedLeadsRow?.c ?? 0 },
      { key: 'DEAL_CREATED', label: 'Became a deal', count: dealCreatedRow?.c ?? 0 },
      { key: 'WON', label: 'Won', count: wonFromLeadRow?.c ?? 0 },
    ];

    // --- Leaderboard: per agent, decided deals (won/lost), commission, avg days to close ---
    const agentRows = await tx.select({ id: users.id, name: users.name }).from(users)
      .where(eq(users.organizationId, a.organizationId));

    const decidedDeals = await tx.select({
      agentId: deals.agentId, status: deals.status, createdAt: deals.createdAt, actualCloseDate: deals.actualCloseDate,
    }).from(deals).where(and(eq(deals.organizationId, a.organizationId), inArray(deals.status, ['WON', 'LOST'])));

    const commissionByAgent = await tx
      .select({ agentId: commissions.agentId, sum: dsql<number>`coalesce(sum(${commissions.amount}),0)` })
      .from(commissions)
      .innerJoin(deals, eq(deals.id, commissions.dealId))
      .where(eq(deals.organizationId, a.organizationId))
      .groupBy(commissions.agentId);
    const commissionMap = new Map(commissionByAgent.map((r) => [r.agentId, Number(r.sum)]));

    const leaderboard = agentRows
      .map((agent) => {
        const mine = decidedDeals.filter((d) => d.agentId === agent.id);
        const won = mine.filter((d) => d.status === 'WON');
        const lost = mine.filter((d) => d.status === 'LOST');
        const closeDurations = won
          .map((d) => {
            if (!d.actualCloseDate) return null;
            const closed = new Date(`${d.actualCloseDate}T00:00:00Z`);
            if (Number.isNaN(closed.getTime())) return null;
            return (closed.getTime() - d.createdAt.getTime()) / (24 * 60 * 60 * 1000);
          })
          .filter((x): x is number => x !== null && x >= 0);
        return {
          agent: { id: agent.id, name: agent.name },
          rank: 0,
          dealsWon: won.length,
          dealsLost: lost.length,
          winRate: mine.length > 0 ? won.length / mine.length : 0,
          commissionEarned: commissionMap.get(agent.id) ?? 0,
          avgDaysToClose: closeDurations.length > 0 ? closeDurations.reduce((s, d) => s + d, 0) / closeDurations.length : null,
        };
      })
      .sort((x, y) => y.commissionEarned - x.commissionEarned)
      .map((row, i) => ({ ...row, rank: i + 1 }));

    // --- Forecast: open deals, weighted by probability, bucketed by expected close month ---
    const openDeals = await tx.select().from(deals)
      .where(and(eq(deals.organizationId, a.organizationId), eq(deals.status, 'OPEN')));

    const forecastMap = new Map<string, { weightedValue: number; rawValue: number; dealCount: number }>();
    for (const d of openDeals) {
      const value = effectiveDealValue(d);
      const weighted = value * (d.probability / 100);
      let key = 'UNSCHEDULED';
      if (d.expectedCloseDate && /^\d{4}-\d{2}-\d{2}$/.test(d.expectedCloseDate)) {
        key = d.expectedCloseDate.slice(0, 7);
      }
      const bucket = forecastMap.get(key) ?? { weightedValue: 0, rawValue: 0, dealCount: 0 };
      bucket.weightedValue += weighted;
      bucket.rawValue += value;
      bucket.dealCount += 1;
      forecastMap.set(key, bucket);
    }
    const forecast: AnalyticsData['forecast'] = Array.from(forecastMap.entries())
      .sort(([ka], [kb]) => (ka === 'UNSCHEDULED' ? 1 : kb === 'UNSCHEDULED' ? -1 : ka.localeCompare(kb)))
      .map(([month, v]) => ({ month, label: monthLabel(month), ...v }));

    // --- Lead source ROI ---
    const leadRows = await tx.select({ id: leads.id, source: leads.source }).from(leads)
      .where(eq(leads.organizationId, a.organizationId));
    const leadIdToSource = new Map(leadRows.map((l) => [l.id, l.source]));
    const sourceLeadCounts = new Map<LeadSource, number>();
    for (const l of leadRows) sourceLeadCounts.set(l.source, (sourceLeadCounts.get(l.source) ?? 0) + 1);

    const dealsWithLead = await tx.select({ id: deals.id, leadId: deals.leadId, status: deals.status }).from(deals)
      .where(and(eq(deals.organizationId, a.organizationId), isNotNull(deals.leadId)));
    const wonDealIds = dealsWithLead.filter((d) => d.status === 'WON').map((d) => d.id);
    const commissionByDeal = wonDealIds.length
      ? await tx.select({ dealId: commissions.dealId, sum: dsql<number>`coalesce(sum(${commissions.amount}),0)` })
          .from(commissions).where(inArray(commissions.dealId, wonDealIds)).groupBy(commissions.dealId)
      : [];
    const commissionByDealMap = new Map(commissionByDeal.map((r) => [r.dealId, Number(r.sum)]));

    const sourceWon = new Map<LeadSource, number>();
    const sourceCommission = new Map<LeadSource, number>();
    for (const d of dealsWithLead) {
      if (d.status !== 'WON' || !d.leadId) continue;
      const source = leadIdToSource.get(d.leadId);
      if (!source) continue;
      sourceWon.set(source, (sourceWon.get(source) ?? 0) + 1);
      sourceCommission.set(source, (sourceCommission.get(source) ?? 0) + (commissionByDealMap.get(d.id) ?? 0));
    }

    const sourceRoi: AnalyticsData['sourceRoi'] = Array.from(sourceLeadCounts.entries())
      .map(([source, totalLeads]) => ({
        source,
        totalLeads,
        dealsWon: sourceWon.get(source) ?? 0,
        conversionRate: totalLeads > 0 ? (sourceWon.get(source) ?? 0) / totalLeads : 0,
        commissionEarned: sourceCommission.get(source) ?? 0,
      }))
      .sort((x, y) => y.commissionEarned - x.commissionEarned);

    return { funnel, leaderboard, forecast, sourceRoi };
  });
}
