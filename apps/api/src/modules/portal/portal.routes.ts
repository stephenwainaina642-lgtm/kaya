import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { uuidField } from '../crm/common';
import { listViewingRequests, confirmViewingRequest, declineViewingRequest } from './portal.service';

/** Staff-side view of client self-service portal activity — currently just
 * viewing requests (document signatures show up inline on the Documents
 * page instead, since there's nothing to "respond to" there). */
export const viewingRequestsRouter = Router();
viewingRequestsRouter.use(authenticate);

viewingRequestsRouter.get('/', requirePermission('viewings:view'), async (req, res, next) => {
  try {
    res.json(await listViewingRequests(ctx(req), req.query));
  } catch (err) {
    next(err);
  }
});

viewingRequestsRouter.post('/:id/confirm', requirePermission('viewings:edit'), async (req, res, next) => {
  try {
    res.json(await confirmViewingRequest(ctx(req), uuidField.parse(req.params.id), req.body));
  } catch (err) {
    next(err);
  }
});

viewingRequestsRouter.post('/:id/decline', requirePermission('viewings:edit'), async (req, res, next) => {
  try {
    await declineViewingRequest(ctx(req), uuidField.parse(req.params.id), req.body);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
