import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { listOwners, getOwner, createOwner, updateOwner, deleteOwner, logOwnerContact } from './owners.service';

export const ownersRouter = Router();
ownersRouter.use(authenticate);

ownersRouter.get('/', requirePermission('owners:view'), async (req, res, next) => {
  try { res.json(await listOwners(ctx(req), req.query)); } catch (err) { next(err); }
});

ownersRouter.post('/', requirePermission('owners:create'), async (req, res, next) => {
  try { res.status(201).json(await createOwner(ctx(req), req.body)); } catch (err) { next(err); }
});

ownersRouter.get('/:id', requirePermission('owners:view'), async (req, res, next) => {
  try { res.json(await getOwner(ctx(req), req.params.id!)); } catch (err) { next(err); }
});

ownersRouter.patch('/:id', requirePermission('owners:edit'), async (req, res, next) => {
  try { res.json(await updateOwner(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

ownersRouter.delete('/:id', requirePermission('owners:delete'), async (req, res, next) => {
  try { await deleteOwner(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});

ownersRouter.post('/:id/contact', requirePermission('owners:edit'), async (req, res, next) => {
  try { res.json(await logOwnerContact(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});
