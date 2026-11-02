import { count, eq, sql as dsql, type SQL } from 'drizzle-orm';
import type { OnboardingStatus } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { organizations, properties, leads, users, viewings } from '../../db/schema';
import { getSampleStatus, isSampleLead, isSampleProperty } from './sample-data.service';
import { notFound } from '../../lib/errors';
import { type Auth } from '../crm/common';

/**
 * Getting-started checklist, derived from what the agency has actually
 * done rather than from stored flags — so a step ticks itself the moment
 * the work exists, however it got there (UI, import, API). Only the
 * "dismissed" choice is stored.
 */
export async function getOnboarding(a: Auth): Promise<OnboardingStatus> {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, a.organizationId));
  if (!org) throw notFound('Organization');

  const counts = await withTenant(a.organizationId, async (tx) => {
    // Demo records never count towards a step: it should tick on the
    // agency's own work, not on what Kaya put there for exploring.
    const n = async (table: typeof properties | typeof leads | typeof users | typeof viewings, not?: SQL) => {
      const q = tx.select({ c: count() }).from(table);
      const [row] = await (not ? q.where(dsql`NOT (${not})`) : q);
      return row?.c ?? 0;
    };
    return {
      properties: await n(properties, isSampleProperty),
      leads: await n(leads, isSampleLead),
      users: await n(users),
      viewings: await n(viewings),
    };
  });

  const steps = [
    { key: 'branding' as const, done: !!org.logoUrl || !!org.brandColor },
    { key: 'property' as const, done: counts.properties > 0 },
    { key: 'lead' as const, done: counts.leads > 0 },
    { key: 'teammate' as const, done: counts.users > 1 },
    { key: 'viewing' as const, done: counts.viewings > 0 },
  ];
  return {
    dismissed: !!org.onboardingDismissedAt,
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
    sampleLoaded: (await getSampleStatus(a)).loaded,
  };
}

export async function dismissOnboarding(a: Auth): Promise<OnboardingStatus> {
  await systemDb.update(organizations).set({ onboardingDismissedAt: new Date() }).where(eq(organizations.id, a.organizationId));
  return getOnboarding(a);
}
