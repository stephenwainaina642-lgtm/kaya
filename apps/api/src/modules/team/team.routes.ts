import { randomBytes } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { PLAN_LABELS, ROLES, planUserLimit } from '@kaya/shared';
import type { TeamMember } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { organizations, users } from '../../db/schema';
import { authenticate, requirePermission, ctx } from '../../middleware/auth';
import { parse } from '../../lib/validate';
import { hashPassword } from '../../lib/password';
import { invalid, planUpgradeRequired, unauthorized } from '../../lib/errors';
import { nameField, textField } from '../crm/common';

export const teamRouter = Router();
teamRouter.use(authenticate);

teamRouter.get('/members', async (req, res, next) => {
  try {
    const a = ctx(req);
    const items: TeamMember[] = await withTenant(a.organizationId, (tx) =>
      tx.select({ id: users.id, name: users.name, role: users.role, jobTitle: users.jobTitle, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.organizationId, a.organizationId))
        .orderBy(users.name));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

const inviteInput = z.object({
  name: nameField,
  email: z.string().trim().email(),
  role: z.enum(ROLES),
  jobTitle: textField(120).nullable().optional(),
});

function generateTempPassword(): string {
  // 12 url-safe characters, easy enough to read off a screen and share.
  return randomBytes(9).toString('base64url');
}

teamRouter.post('/members', requirePermission('team:create'), async (req, res, next) => {
  try {
    const a = ctx(req);
    const input = parse(inviteInput, req.body);

    const [org] = await systemDb.select({ plan: organizations.plan }).from(organizations).where(eq(organizations.id, a.organizationId));
    if (!org) throw unauthorized();
    const userLimit = planUserLimit(org.plan);
    if (userLimit !== null) {
      const [memberCountRow] = await systemDb.select({ value: count() }).from(users).where(eq(users.organizationId, a.organizationId));
      if ((memberCountRow?.value ?? 0) >= userLimit) {
        throw planUpgradeRequired(
          `Your ${PLAN_LABELS[org.plan]} plan allows up to ${userLimit} users. Upgrade to add more team members.`,
          'GROWTH',
        );
      }
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const member = await withTenant(a.organizationId, async (tx) => {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email.toLowerCase()));
      if (existing) throw invalid({ email: 'A user with this email already exists' });
      const [row] = await tx
        .insert(users)
        .values({
          organizationId: a.organizationId,
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash,
          role: input.role,
          jobTitle: input.jobTitle ?? null,
        })
        .returning();
      return row;
    });

    res.status(201).json({
      member: { id: member!.id, name: member!.name, role: member!.role, jobTitle: member!.jobTitle, avatarUrl: member!.avatarUrl } satisfies TeamMember,
      tempPassword,
    });
  } catch (err) {
    next(err);
  }
});
