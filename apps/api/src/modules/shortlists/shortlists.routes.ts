import { Router } from 'express';
import { authenticate, ctx } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { uuidField } from '../crm/common';
import {
  listShortlistsForClient, getShortlist, createShortlist, addPropertyToShortlist,
  removePropertyFromShortlist, deleteShortlist,
} from './shortlists.service';

export const shortlistsRouter = Router();
shortlistsRouter.use(authenticate);
// Client shortlists are a Growth-and-up feature (see pricing table). Public
// /share/:token viewing lives on a different router (platform.routes.ts)
// and is unaffected — clients can still view a shortlist shared before any
// downgrade.
shortlistsRouter.use(requirePlanModule('shortlists'));

shortlistsRouter.get('/clients/:clientId', async (req, res, next) => {
  try {
    const a = ctx(req);
    const clientId = uuidField.parse(req.params.clientId);
    res.json({ items: await listShortlistsForClient(a, clientId) });
  } catch (err) {
    next(err);
  }
});

shortlistsRouter.post('/', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.status(201).json(await createShortlist(a, req.body));
  } catch (err) {
    next(err);
  }
});

shortlistsRouter.get('/:id', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await getShortlist(a, req.params.id));
  } catch (err) {
    next(err);
  }
});

shortlistsRouter.post('/:id/items', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await addPropertyToShortlist(a, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

shortlistsRouter.delete('/:id/items/:propertyId', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await removePropertyFromShortlist(a, req.params.id, req.params.propertyId));
  } catch (err) {
    next(err);
  }
});

shortlistsRouter.delete('/:id', async (req, res, next) => {
  try {
    const a = ctx(req);
    await deleteShortlist(a, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
