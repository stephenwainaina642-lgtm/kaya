import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { listAuditLog, auditLogQuery } from './audit.service';

export const auditRouter = Router();
auditRouter.use(authenticate);
// Full audit log viewing is a Pro-only feature (see pricing table).
auditRouter.use(requirePlanModule('auditLog'));

auditRouter.get('/', requirePermission('audit:view'), async (req, res, next) => {
  try {
    const a = ctx(req);
    const q = auditLogQuery.parse(req.query);
    res.json(await listAuditLog(a, q));
  } catch (err) {
    next(err);
  }
});
