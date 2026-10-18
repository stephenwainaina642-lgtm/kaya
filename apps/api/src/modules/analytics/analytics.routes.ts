import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { getAnalytics } from './analytics.service';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);
// Funnel/leaderboard/forecast/source-ROI is the "custom reporting" feature the
// pricing table reserves for Pro — the existing basic ReportsPage stays free.
analyticsRouter.use(requirePlanModule('analytics'));

analyticsRouter.get('/', requirePermission('reports:view'), async (req, res, next) => {
  try {
    res.json(await getAnalytics(ctx(req)));
  } catch (err) {
    next(err);
  }
});
