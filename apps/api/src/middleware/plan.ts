import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { PLAN_LABELS, type PlanModule, minPlanForModule, planHasModule } from '@kaya/shared';
import { systemDb } from '../db/system';
import { organizations } from '../db/schema';
import { planUpgradeRequired, unauthorized } from '../lib/errors';

/**
 * Gates a route (or an entire router) to organizations whose plan includes
 * the given module — see packages/shared/src/plans.ts for the plan/module
 * matrix. Looked up fresh per-request (not cached in the JWT) so an
 * upgrade/downgrade by a platform admin takes effect immediately without
 * requiring the user to log out and back in.
 */
export function requirePlanModule(module: PlanModule) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const a = req.auth;
    if (!a) {
      next(unauthorized());
      return;
    }
    try {
      const [org] = await systemDb
        .select({ plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, a.organizationId));
      if (!org) {
        next(unauthorized());
        return;
      }
      if (!planHasModule(org.plan, module)) {
        const required = minPlanForModule(module);
        next(
          planUpgradeRequired(
            `This feature requires the ${PLAN_LABELS[required]} plan or higher. Ask your workspace admin to upgrade.`,
            required,
          ),
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
