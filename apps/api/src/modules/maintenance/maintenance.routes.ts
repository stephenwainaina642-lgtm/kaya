import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { listMaintenance, createMaintenance, updateMaintenance, deleteMaintenance } from './maintenance.service';

export const maintenanceRouter = Router();
maintenanceRouter.use(authenticate, requirePlanModule('rentManagement'));

maintenanceRouter.get('/', requirePermission('maintenance:view'), async (req, res, next) => {
  try { res.json(await listMaintenance(ctx(req), req.query as { status?: string; propertyId?: string })); } catch (err) { next(err); }
});
maintenanceRouter.post('/', requirePermission('maintenance:create'), async (req, res, next) => {
  try { res.status(201).json(await createMaintenance(ctx(req), req.body)); } catch (err) { next(err); }
});
maintenanceRouter.patch('/:id', requirePermission('maintenance:edit'), async (req, res, next) => {
  try { res.json(await updateMaintenance(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});
maintenanceRouter.delete('/:id', requirePermission('maintenance:delete'), async (req, res, next) => {
  try { await deleteMaintenance(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});
