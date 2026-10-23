import { z } from 'zod';
import { eq, sql, inArray } from 'drizzle-orm';
import type {
  PlatformLoginResult, PlatformOrgPage, PlatformOrgDetail, PlatformStats,
} from '@kaya/shared';
import { PLANS } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { organizations, users, leads, clients, properties, deals, platformAdmins } from '../../db/schema';
import { verifyPassword } from '../../lib/password';
import { signPlatformToken } from '../../lib/tokens';
import { unauthorized, notFound, locked } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { isLocked, recordFailedAttempt, clearLockout } from '../../lib/lockout';

export const platformLoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function platformLogin(body: unknown): Promise<PlatformLoginResult> {
  const input = parse(platformLoginInput, body);
  const [admin] = await systemDb.select().from(platformAdmins).where(eq(platformAdmins.email, input.email.toLowerCase()));
  if (!admin) throw unauthorized('Invalid email or password');

  if (isLocked(admin.lockedUntil)) {
    throw locked('Too many failed attempts. Try again in a few minutes.');
  }

  const ok = await verifyPassword(admin.passwordHash, input.password);
  if (!ok) {
    await systemDb.update(platformAdmins).set(recordFailedAttempt(admin.failedLoginAttempts)).where(eq(platformAdmins.id, admin.id));
    throw unauthorized('Invalid email or password');
  }

  await systemDb.update(platformAdmins).set({ lastLoginAt: new Date(), ...clearLockout }).where(eq(platformAdmins.id, admin.id));

  const accessToken = signPlatformToken({ sub: admin.id, email: admin.email, name: admin.name });
  return { accessToken, admin: { id: admin.id, name: admin.name, email: admin.email } };
}

async function orgAggregates(orgIds: string[]) {
  if (orgIds.length === 0) {
    return new Map<string, { userCount: number; dealCount: number; pipelineValue: number }>();
  }
  const [userCounts, dealRows] = await Promise.all([
    systemDb
      .select({ organizationId: users.organizationId, c: sql<number>`count(*)::int` })
      .from(users)
      .where(inArray(users.organizationId, orgIds))
      .groupBy(users.organizationId),
    systemDb
      .select({
        organizationId: deals.organizationId,
        c: sql<number>`count(*)::int`,
        value: sql<number>`coalesce(sum(${deals.dealValue}), 0)::float`,
      })
      .from(deals)
      .where(inArray(deals.organizationId, orgIds))
      .groupBy(deals.organizationId),
  ]);

  const map = new Map<string, { userCount: number; dealCount: number; pipelineValue: number }>();
  for (const id of orgIds) map.set(id, { userCount: 0, dealCount: 0, pipelineValue: 0 });
  for (const r of userCounts) map.get(r.organizationId)!.userCount = r.c;
  for (const r of dealRows) {
    const entry = map.get(r.organizationId)!;
    entry.dealCount = r.c;
    entry.pipelineValue = r.value;
  }
  return map;
}

export async function listOrganizations(): Promise<PlatformOrgPage> {
  const orgs = await systemDb.select().from(organizations).orderBy(organizations.createdAt);
  const aggregates = await orgAggregates(orgs.map((o) => o.id));

  const items = orgs.map((o) => {
    const agg = aggregates.get(o.id) ?? { userCount: 0, dealCount: 0, pipelineValue: 0 };
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      plan: o.plan,
      currency: o.currency,
      suspended: o.suspendedAt !== null,
      createdAt: o.createdAt.toISOString(),
      userCount: agg.userCount,
      dealCount: agg.dealCount,
      pipelineValue: agg.pipelineValue,
    };
  });

  return { items, total: items.length };
}

export async function getOrganization(id: string): Promise<PlatformOrgDetail> {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, id));
  if (!org) throw notFound('Organization');

  const [orgUsers, [leadCount], [clientCount], [propertyCount], [dealAgg]] = await Promise.all([
    systemDb.select().from(users).where(eq(users.organizationId, id)).orderBy(users.createdAt),
    systemDb.select({ c: sql<number>`count(*)::int` }).from(leads).where(eq(leads.organizationId, id)),
    systemDb.select({ c: sql<number>`count(*)::int` }).from(clients).where(eq(clients.organizationId, id)),
    systemDb.select({ c: sql<number>`count(*)::int` }).from(properties).where(eq(properties.organizationId, id)),
    systemDb
      .select({ c: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${deals.dealValue}), 0)::float` })
      .from(deals)
      .where(eq(deals.organizationId, id)),
  ]);

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    currency: org.currency,
    timezone: org.timezone,
    phone: org.phone,
    suspended: org.suspendedAt !== null,
    createdAt: org.createdAt.toISOString(),
    users: orgUsers.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    })),
    counts: {
      leads: leadCount?.c ?? 0,
      clients: clientCount?.c ?? 0,
      properties: propertyCount?.c ?? 0,
      deals: dealAgg?.c ?? 0,
    },
    pipelineValue: dealAgg?.value ?? 0,
  };
}

export const updateOrganizationInput = z.object({
  plan: z.enum(PLANS).optional(),
  suspended: z.boolean().optional(),
});

export async function updateOrganization(id: string, body: unknown): Promise<PlatformOrgDetail> {
  const input = parse(updateOrganizationInput, body);
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, id));
  if (!org) throw notFound('Organization');

  const patch: Partial<typeof organizations.$inferInsert> = {};
  if (input.plan) patch.plan = input.plan;
  if (input.suspended !== undefined) patch.suspendedAt = input.suspended ? new Date() : null;

  if (Object.keys(patch).length > 0) {
    await systemDb.update(organizations).set(patch).where(eq(organizations.id, id));
  }
  return getOrganization(id);
}

export async function getStats(): Promise<PlatformStats> {
  const [orgs, [userTotal], [dealAgg]] = await Promise.all([
    systemDb.select().from(organizations),
    systemDb.select({ c: sql<number>`count(*)::int` }).from(users),
    systemDb.select({ value: sql<number>`coalesce(sum(${deals.dealValue}), 0)::float` }).from(deals),
  ]);

  const byPlan = PLANS.map((plan) => ({ plan, count: orgs.filter((o) => o.plan === plan).length }));
  const recentOrganizations = [...orgs]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((o) => ({ id: o.id, name: o.name, slug: o.slug, plan: o.plan, createdAt: o.createdAt.toISOString() }));

  return {
    totalOrganizations: orgs.length,
    totalUsers: userTotal?.c ?? 0,
    totalPipelineValue: dealAgg?.value ?? 0,
    suspendedOrganizations: orgs.filter((o) => o.suspendedAt !== null).length,
    byPlan,
    recentOrganizations,
  };
}
