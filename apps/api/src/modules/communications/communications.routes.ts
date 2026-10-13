import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { communicationsQuery, listCommunications, createCommunication } from './communications.service';

export const communicationsRouter = Router();
communicationsRouter.use(authenticate);

communicationsRouter.get('/', requirePermission('communications:view'), async (req, res, next) => {
  try {
    const a = ctx(req);
    const q = communicationsQuery.parse(req.query);
    res.json(await listCommunications(a, q));
  } catch (err) {
    next(err);
  }
});

communicationsRouter.post('/', requirePermission('communications:create'), async (req, res, next) => {
  try {
    const a = ctx(req);
    res.status(201).json(await createCommunication(a, req.body));
  } catch (err) {
    next(err);
  }
});
