import { z } from 'zod';
import { and, eq, gte, lt, isNotNull } from 'drizzle-orm';
import type { CalendarItem, CalendarPage } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { viewings, followUps, tasks, deals, properties } from '../../db/schema';
import { type Auth } from '../crm/common';
import { invalid } from '../../lib/errors';

export const calendarQuery = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

export async function getCalendar(a: Auth, q: z.infer<typeof calendarQuery>): Promise<CalendarPage> {
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (to <= from) throw invalid({ to: 'must be after from' });

  return withTenant(a.organizationId, async (tx) => {
    const viewingRows = await tx
      .select({ v: viewings, propTitle: properties.title })
      .from(viewings)
      .innerJoin(properties, eq(properties.id, viewings.propertyId))
      .where(and(eq(viewings.organizationId, a.organizationId), gte(viewings.scheduledAt, from), lt(viewings.scheduledAt, to)));

    const followUpRows = await tx
      .select()
      .from(followUps)
      .where(and(eq(followUps.organizationId, a.organizationId), gte(followUps.dueAt, from), lt(followUps.dueAt, to)));

    const taskRows = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, a.organizationId), isNotNull(tasks.dueAt), gte(tasks.dueAt, from), lt(tasks.dueAt, to)));

    const dealRows = await tx.select().from(deals).where(eq(deals.organizationId, a.organizationId));
    const dealDeadlines = dealRows.filter((d) => {
      if (!d.expectedCloseDate) return false;
      const at = new Date(`${d.expectedCloseDate}T00:00:00.000Z`);
      return at >= from && at < to;
    });

    const items: CalendarItem[] = [
      ...viewingRows.map((r) => ({
        id: r.v.id,
        type: 'VIEWING' as const,
        title: `Viewing: ${r.propTitle}`,
        subtitle: r.v.meetingLocation,
        at: r.v.scheduledAt.toISOString(),
        endAt: new Date(r.v.scheduledAt.getTime() + r.v.durationMinutes * 60000).toISOString(),
        status: r.v.status,
        link: `/viewings/${r.v.id}`,
      })),
      ...followUpRows.map((r) => ({
        id: r.id,
        type: 'FOLLOW_UP' as const,
        title: r.title,
        subtitle: null,
        at: r.dueAt.toISOString(),
        endAt: null,
        status: r.status,
        link: `/follow-ups/${r.id}`,
      })),
      ...taskRows.map((r) => ({
        id: r.id,
        type: 'TASK' as const,
        title: r.title,
        subtitle: null,
        at: (r.dueAt as Date).toISOString(),
        endAt: null,
        status: r.status,
        link: `/tasks/${r.id}`,
      })),
      ...dealDeadlines.map((d) => ({
        id: d.id,
        type: 'DEAL_DEADLINE' as const,
        title: `Expected close: ${d.name}`,
        subtitle: null,
        at: new Date(`${d.expectedCloseDate}T00:00:00.000Z`).toISOString(),
        endAt: null,
        status: d.status,
        link: `/deals/${d.id}`,
      })),
    ].sort((x, y) => x.at.localeCompare(y.at));

    return { items };
  });
}
