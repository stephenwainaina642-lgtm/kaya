import { eq, and, gt } from 'drizzle-orm';
import { z } from 'zod';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { users, refreshTokens } from '../../db/schema';
import { verifyPassword } from '../../lib/password';
import { signAccessToken, newRefreshToken, hashRefreshToken } from '../../lib/tokens';
import { unauthorized } from '../../lib/errors';
import { parse } from '../../lib/validate';

export const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string; email: string; role: string; organizationId: string };
}

export async function login(body: unknown): Promise<LoginResult> {
  const input = parse(loginInput, body);
  const [user] = await systemDb.select().from(users).where(eq(users.email, input.email.toLowerCase()));
  if (!user) throw unauthorized('Invalid email or password');
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw unauthorized('Invalid email or password');

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
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId },
  };
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

  return {
    accessToken,
    refreshToken: newToken,
    user: { id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role, organizationId: row.user.organizationId },
  };
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
    return { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId, jobTitle: user.jobTitle, avatarUrl: user.avatarUrl };
  });
}
