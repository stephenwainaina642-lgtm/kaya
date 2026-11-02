import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { exportEntity } from './export.service';

export const exportRouter = Router();
exportRouter.use(authenticate);

// Whole-agency data leaves the system here, so org admins only.
exportRouter.get('/:entity', requirePermission('settings:edit'), async (req, res, next) => {
  try {
    const { filename, csv } = await exportEntity(ctx(req), req.params.entity!);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});
