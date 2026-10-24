import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { eq, sql, inArray, like } from 'drizzle-orm';
import type {
  PlatformLoginResult, PlatformOrgPage, PlatformOrgDetail, PlatformStats, PlatformCreateOrgResult,
} from '@kaya/shared';
import { PLANS } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { organizations, users, leads, clients, properties, deals, platformAdmins } from '../../db/schema';
import { verifyPassword, hashPassword } from '../../lib/password';
import { signPlatformToken } from '../../lib/tokens';
import { unauthorized, notFound, locked, conflict } from '../../lib/errors';
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

function generateTempPassword(): string {
  // Same scheme as the agency-side "invite a team member" flow
  // (team.routes.ts) — 12 url-safe characters, easy to read off a screen
  // and share with the new agency over a call or WhatsApp.
  return randomBytes(9).toString('base64url');
}

async function uniqueSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agency';

  const existing = await systemDb
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(like(organizations.slug, `${base}%`));
  const taken = new Set(existing.map((o) => o.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const createOrganizationInput = z.object({
  organizationName: z.string().trim().min(1).max(200),
  plan: z.enum(PLANS).default('STARTER'),
  adminName: z.string().trim().min(1).max(200),
  adminEmail: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(40).nullable().optional(),
});

/**
 * The only way a real agency gets onto Kaya right now: a platform operator
 * fills this in by hand (no self-serve signup — see /inquire/:slug for the
 * *lead* capture equivalent, which is a different thing). Creates the
 * organization and its first ORG_ADMIN user in one step, with a
 * server-generated temporary password the operator copies and shares
 * with the agency directly — there's no outbound email sending in this
 * app, so a password reset link isn't an option yet.
 */
export async function createOrganization(body: unknown): Promise<PlatformCreateOrgResult> {
  const input = parse(createOrganizationInput, body);

  const [existingEmail] = await systemDb.select({ id: users.id }).from(users).where(eq(users.email, input.adminEmail));
  if (existingEmail) throw conflict('A user with this email already exists on Kaya');

  const slug = await uniqueSlug(input.organizationName);
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const [orgRow] = await systemDb
    .insert(organizations)
    .values({ name: input.organizationName, slug, plan: input.plan, phone: input.phone ?? null })
    .returning();
  const org = orgRow!;

  const admin = await withTenant(org.id, async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({
        organizationId: org.id,
        name: input.adminName,
        email: input.adminEmail,
        passwordHash,
        role: 'ORG_ADMIN',
      })
      .returning();
    return row!;
  });

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      currency: org.currency,
      suspended: false,
      createdAt: org.createdAt.toISOString(),
      userCount: 1,
      dealCount: 0,
      pipelineValue: 0,
    },
    admin: { id: admin.id, name: admin.name, email: admin.email, tempPassword },
  };
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
