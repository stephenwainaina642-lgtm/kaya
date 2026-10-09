import { eq } from 'drizzle-orm';
import { Router } from 'express';
import type { TeamMember } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { users } from '../../db/schema';
import { authenticate, ctx } from '../../middleware/auth';

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
