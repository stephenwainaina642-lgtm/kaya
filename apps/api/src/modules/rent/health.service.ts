import { and, eq, gte, inArray, lt, lte, sql as dsql } from 'drizzle-orm';
import type { HealthAction, HealthComponent, PortfolioHealth } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { leases, maintenanceRequests, organizations, properties, rentCharges } from '../../db/schema';
import { type Auth } from '../crm/common';

export interface HealthInputs {
  currency: string;
  /** Rent charged and collected for months that fell due in the last 90 days. */
  charged: number;
  collected: number;
  overdueTenants: number;
  rentalUnits: number;
  letUnits: number;
  openRepairs: number;
  /** Open repairs older than 14 days. */
  agedRepairs: number;
  urgentRepairs: number;
  /** Leases still marked active after their end date. */
  lapsedLeases: number;
  expiringSoon: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const WEIGHTS = { COLLECTION: 40, OCCUPANCY: 30, REPAIRS: 15, LEASES: 15 } as const;

/** Pure scoring so it can be tested without a database. Unmeasurable parts drop out and the rest are re-weighted. */
export function scoreHealth(i: HealthInputs): PortfolioHealth {
  const collectionRate = i.charged > 0 ? i.collected / i.charged : null;
  const components: HealthComponent[] = [
    {
      key: 'COLLECTION', label: 'Rent collected', weight: WEIGHTS.COLLECTION,
      score: collectionRate === null ? null : clamp(collectionRate * 100),
      detail: collectionRate === null ? 'No rent has fallen due yet' : `${Math.round(collectionRate * 100)}% of the last 3 months' rent collected`,
    },
    {
      key: 'OCCUPANCY', label: 'Occupancy', weight: WEIGHTS.OCCUPANCY,
      score: i.rentalUnits === 0 ? null : clamp((i.letUnits / i.rentalUnits) * 100),
      detail: i.rentalUnits === 0 ? 'No rental units yet' : `${i.letUnits} of ${i.rentalUnits} units let`,
    },
    {
      key: 'REPAIRS', label: 'Repairs', weight: WEIGHTS.REPAIRS,
      // Each repair left open for over two weeks costs 15 points; an urgent one 25.
      score: clamp(100 - i.agedRepairs * 15 - i.urgentRepairs * 10),
      detail: i.openRepairs === 0 ? 'Nothing open' : `${i.openRepairs} open, ${i.agedRepairs} for over 2 weeks`,
    },
    {
      key: 'LEASES', label: 'Leases up to date', weight: WEIGHTS.LEASES,
      score: i.rentalUnits === 0 ? null : clamp(100 - i.lapsedLeases * 25),
      detail: i.rentalUnits === 0 ? 'No leases yet' : i.lapsedLeases ? `${i.lapsedLeases} past their end date` : i.expiringSoon ? `${i.expiringSoon} ending within 60 days` : 'All current',
    },
  ];

  const measured = components.filter((c) => c.score !== null);
  const totalWeight = measured.reduce((n, c) => n + c.weight, 0);
  const score = totalWeight === 0 ? null : Math.round(measured.reduce((n, c) => n + (c.score as number) * c.weight, 0) / totalWeight);

  // What each component is costing the overall score, biggest first.
  const loss = (c: HealthComponent) => (c.score === null || totalWeight === 0 ? 0 : ((100 - c.score) * c.weight) / totalWeight);
  const text: Record<HealthComponent['key'], string> = {
    COLLECTION: `Collect the overdue rent (${i.overdueTenants} tenant${i.overdueTenants === 1 ? '' : 's'} behind, ${formatMoney(Math.max(0, i.charged - i.collected), i.currency)} uncollected)`,
    OCCUPANCY: `Let the ${i.rentalUnits - i.letUnits} vacant unit${i.rentalUnits - i.letUnits === 1 ? '' : 's'}`,
    REPAIRS: `Close the ${i.agedRepairs} repair${i.agedRepairs === 1 ? '' : 's'} open for over 2 weeks${i.urgentRepairs ? ` (${i.urgentRepairs} urgent)` : ''}`,
    LEASES: `Renew or end the ${i.lapsedLeases} lease${i.lapsedLeases === 1 ? '' : 's'} past their end date`,
  };
  const to: Record<HealthComponent['key'], string> = { COLLECTION: '/rent', OCCUPANCY: '/buildings', REPAIRS: '/maintenance', LEASES: '/rent' };
  const actions: HealthAction[] = components
    .map((c) => ({ c, gain: Math.round(loss(c)) }))
    .filter((x) => x.gain >= 1)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3)
    .map((x) => ({ text: text[x.c.key], gain: x.gain, to: to[x.c.key] }));

  const label: PortfolioHealth['label'] = score === null ? 'Not enough data' : score >= 85 ? 'Excellent' : score >= 70 ? 'Healthy' : score >= 50 ? 'Needs attention' : 'At risk';
  return { score, label, components, actions };
}

export async function getPortfolioHealth(a: Auth): Promise<PortfolioHealth> {
  const [org] = await systemDb.select({ currency: organizations.currency }).from(organizations).where(eq(organizations.id, a.organizationId));
  const currency = org?.currency ?? 'KES';
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const since = new Date(today.getTime() - 90 * 86_400_000);
  const soon = new Date(today.getTime() + 60 * 86_400_000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 86_400_000);

  const inputs = await withTenant(a.organizationId, async (tx) => {
    const [rent] = await tx.select({
      charged: dsql<number>`coalesce(sum(${rentCharges.amount}), 0)::int`,
      collected: dsql<number>`coalesce(sum(${rentCharges.paidAmount}), 0)::int`,
      behind: dsql<number>`count(distinct ${rentCharges.leaseId}) filter (where ${rentCharges.status} <> 'PAID' and ${rentCharges.amount} > ${rentCharges.paidAmount})::int`,
    }).from(rentCharges).where(and(gte(rentCharges.dueDate, iso(since)), lte(rentCharges.dueDate, iso(today))));

    const [units] = await tx.select({ n: dsql<number>`count(*)::int` }).from(properties).where(eq(properties.listingType, 'RENT'));
    const [let_] = await tx.select({ n: dsql<number>`count(distinct ${leases.propertyId})::int` }).from(leases).where(eq(leases.status, 'ACTIVE'));
    const [lapsed] = await tx.select({ n: dsql<number>`count(*)::int` }).from(leases).where(and(eq(leases.status, 'ACTIVE'), lt(leases.endDate, iso(today))));
    const [expiring] = await tx.select({ n: dsql<number>`count(*)::int` }).from(leases)
      .where(and(eq(leases.status, 'ACTIVE'), gte(leases.endDate, iso(today)), lte(leases.endDate, iso(soon))));

    const open = and(inArray(maintenanceRequests.status, ['OPEN', 'IN_PROGRESS']));
    const [repairs] = await tx.select({
      open: dsql<number>`count(*)::int`,
      aged: dsql<number>`count(*) filter (where ${maintenanceRequests.createdAt} < ${twoWeeksAgo})::int`,
      urgent: dsql<number>`count(*) filter (where ${maintenanceRequests.priority} = 'URGENT')::int`,
    }).from(maintenanceRequests).where(open);

    return { rent: rent!, units: units!.n, let: let_!.n, lapsed: lapsed!.n, expiring: expiring!.n, repairs: repairs! };
  });

  return scoreHealth({
    currency, charged: inputs.rent.charged, collected: inputs.rent.collected, overdueTenants: inputs.rent.behind,
    rentalUnits: inputs.units, letUnits: Math.min(inputs.let, inputs.units || inputs.let),
    openRepairs: inputs.repairs.open, agedRepairs: inputs.repairs.aged, urgentRepairs: inputs.repairs.urgent,
    lapsedLeases: inputs.lapsed, expiringSoon: inputs.expiring,
  });
}
