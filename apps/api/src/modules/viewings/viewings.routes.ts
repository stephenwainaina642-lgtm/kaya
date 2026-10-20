import { Router } from 'express';
import { authenticate, ctx } from '../../middleware/auth';
import {
  listViewings, getViewing, createViewing, updateViewing, cancelViewing,
  markNoShow, completeViewing, deleteViewing,
} from './viewings.service';

export const viewingsRouter = Router();
viewingsRouter.use(authenticate);

viewingsRouter.get('/', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await listViewings(a, req.query));
  } catch (err) {
    next(err);
  }
});

viewingsRouter.post('/', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.status(201).json(await createViewing(a, req.body));
  } catch (err) {
    next(err);
  }
});

viewingsRouter.get('/:id', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await getViewing(a, req.params.id));
  } catch (err) {
    next(err);
  }
});

viewingsRouter.patch('/:id', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await updateViewing(a, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

viewingsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await cancelViewing(a, req.params.id, req.body?.reason));
  } catch (err) {
    next(err);
  }
});

viewingsRouter.post('/:id/no-show', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await markNoShow(a, req.params.id));
  } catch (err) {
    next(err);
  }
});

viewingsRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const a = ctx(req);
    res.json(await completeViewing(a, req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});

viewingsRouter.delete('/:id', async (req, res, next) => {
  try {
    const a = ctx(req);
    await deleteViewing(a, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
