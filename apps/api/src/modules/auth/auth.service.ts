import { eq, and, gt } from 'drizzle-orm';
import { z } from 'zod';
import type { Plan } from '@kaya/shared';
import { CURRENCIES } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { users, refreshTokens, organizations } from '../../db/schema';
import { verifyPassword, hashPassword } from '../../lib/password';
import { signAccessToken, newRefreshToken, hashRefreshToken } from '../../lib/tokens';
import { unauthorized, invalid, forbidden, locked, conflict } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { isLocked, recordFailedAttempt, clearLockout } from '../../lib/lockout';
import { uniqueSlug } from '../../lib/slug';
import { toPublicLogoUrl } from '../../lib/branding';

export const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
  plan: Plan;
  organizationName: string;
  currency: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
}

function toUserDto(user: typeof users.$inferSelect, org: typeof organizations.$inferSelect): AuthUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    plan: org.plan,
    organizationName: org.name,
    currency: org.currency,
    logoUrl: toPublicLogoUrl(org.slug, org.logoUrl),
    brandColor: org.brandColor,
  };
}

export async function login(body: unknown): Promise<LoginResult> {
  const input = parse(loginInput, body);
  const [user] = await systemDb.select().from(users).where(eq(users.email, input.email.toLowerCase()));
  if (!user) throw unauthorized('Invalid email or password');

  if (isLocked(user.lockedUntil)) {
    throw locked('Too many failed attempts. Try again in a few minutes.');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    await systemDb.update(users).set(recordFailedAttempt(user.failedLoginAttempts)).where(eq(users.id, user.id));
    throw unauthorized('Invalid email or password');
  }

  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, user.organizationId));
  if (!org) throw unauthorized();
  if (org.suspendedAt) throw forbidden('This workspace has been suspended. Contact your account manager.');

  const accessToken = signAccessToken({
    sub: user.id,
    organizationId: user.organizationId,
    role: user.role,
    name: user.name,
  });
  const refreshToken = newRefreshToken();
  await withTenant(user.organizationId, async (tx) => {
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    await tx.update(users).set({ lastLoginAt: new Date(), ...clearLockout }).where(eq(users.id, user.id));
  });

  return { accessToken, refreshToken, user: toUserDto(user, org) };
}

export async function refresh(token: string | undefined): Promise<LoginResult> {
  if (!token) throw unauthorized('Missing refresh token');
  const tokenHash = hashRefreshToken(token);
  const [row] = await systemDb
    .select({ rt: refreshTokens, user: users })
    .from(refreshTokens)
    .innerJoin(users, eq(users.id, refreshTokens.userId))
    .where(and(eq(refreshTokens.tokenHash, tokenHash), gt(refreshTokens.expiresAt, new Date())));
  if (!row) throw unauthorized('Invalid or expired refresh token');

  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, row.user.organizationId));
  if (!org) throw unauthorized();
  if (org.suspendedAt) throw forbidden('This workspace has been suspended. Contact your account manager.');

  const accessToken = signAccessToken({
    sub: row.user.id,
    organizationId: row.user.organizationId,
    role: row.user.role,
    name: row.user.name,
  });
  const newToken = newRefreshToken();
  await withTenant(row.user.organizationId, async (tx) => {
    await tx.delete(refreshTokens).where(eq(refreshTokens.id, row.rt.id));
    await tx.insert(refreshTokens).values({
      userId: row.user.id,
      tokenHash: hashRefreshToken(newToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
  });

  return { accessToken, refreshToken: newToken, user: toUserDto(row.user, org) };
}

export const registerInput = z.object({
  organizationName: z.string().trim().min(1).max(200),
  currency: z.enum(CURRENCIES.map((c) => c.code) as [string, ...string[]]).default('KES'),
  adminName: z.string().trim().min(1).max(200),
  adminEmail: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  phone: z.string().trim().max(40).nullable().optional(),
});

/**
 * Public self-serve signup: anyone can create their own agency workspace
 * and is logged straight in, no platform-admin approval step. This is the
 * public counterpart to platform-admin.service.ts's createOrganization —
 * that one stays as the manually-operated path for white-glove/managed
 * onboarding; this one is for an agency that wants to just get started.
 * New workspaces default to the STARTER plan — same as any other new
 * signup anywhere, upgrading is a billing step for later.
 */
export async function register(body: unknown): Promise<LoginResult> {
  const input = parse(registerInput, body);

  const [existingEmail] = await systemDb.select({ id: users.id }).from(users).where(eq(users.email, input.adminEmail));
  if (existingEmail) throw conflict('A Kaya account with this email already exists. Try logging in instead.');

  const slug = await uniqueSlug(input.organizationName);
  const passwordHash = await hashPassword(input.password);

  const [org] = await systemDb
    .insert(organizations)
    .values({
      name: input.organizationName,
      slug,
      plan: 'STARTER',
      currency: input.currency,
      phone: input.phone ?? null,
    })
    .returning();
  if (!org) throw new Error('failed to create organization');

  const user = await withTenant(org.id, async (tx) => {
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

  const accessToken = signAccessToken({
    sub: user.id,
    organizationId: org.id,
    role: user.role,
    name: user.name,
  });
  const refreshToken = newRefreshToken();
  await withTenant(org.id, async (tx) => {
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
  });

  return { accessToken, refreshToken, user: toUserDto(user, org) };
}

export async function logout(organizationId: string | undefined, token: string | undefined): Promise<void> {
  if (!token || !organizationId) return;
  const tokenHash = hashRefreshToken(token);
  await withTenant(organizationId, async (tx) => {
    await tx.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  });
}

export async function me(organizationId: string, userId: string) {
  return withTenant(organizationId, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) throw unauthorized();
    const [org] = await tx.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, organizationId));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      plan: org?.plan ?? 'STARTER',
      jobTitle: user.jobTitle,
      avatarUrl: user.avatarUrl,
    };
  });
}

export const updateProfileInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export async function updateProfile(organizationId: string, userId: string, body: unknown) {
  const input = parse(updateProfileInput, body);
  return withTenant(organizationId, async (tx) => {
    await tx.update(users).set(input).where(eq(users.id, userId));
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) throw unauthorized();
    return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId, jobTitle: user.jobTitle, avatarUrl: user.avatarUrl };
  });
}

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export async function changePassword(organizationId: string, userId: string, body: unknown): Promise<void> {
  const input = parse(changePasswordInput, body);
  await withTenant(organizationId, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) throw unauthorized();
    const ok = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!ok) throw invalid({ currentPassword: 'Current password is incorrect' });
    const passwordHash = await hashPassword(input.newPassword);
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  });
}
