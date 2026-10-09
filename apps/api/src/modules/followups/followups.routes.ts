import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { listFollowUps, createFollowUp, updateFollowUp, completeFollowUp, deleteFollowUp } from './followups.service';

export const followUpsRouter = Router();
followUpsRouter.use(authenticate);

followUpsRouter.get('/', requirePermission('followups:view'), async (req, res, next) => {
  try { res.json(await listFollowUps(ctx(req), req.query)); } catch (err) { next(err); }
});

followUpsRouter.post('/', requirePermission('followups:create'), async (req, res, next) => {
  try { res.status(201).json(await createFollowUp(ctx(req), req.body)); } catch (err) { next(err); }
});

followUpsRouter.patch('/:id', requirePermission('followups:edit'), async (req, res, next) => {
  try { res.json(await updateFollowUp(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

followUpsRouter.post('/:id/complete', requirePermission('followups:edit'), async (req, res, next) => {
  try { res.json(await completeFollowUp(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

followUpsRouter.delete('/:id', requirePermission('followups:delete'), async (req, res, next) => {
  try { await deleteFollowUp(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});
