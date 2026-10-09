import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import {
  listClients, getClient, createClient, updateClient, logClientContact, saveClientRequirements,
  getClientTimeline, deleteClient,
} from './clients.service';

export const clientsRouter = Router();
clientsRouter.use(authenticate);

clientsRouter.get('/', requirePermission('clients:view'), async (req, res, next) => {
  try { res.json(await listClients(ctx(req), req.query)); } catch (err) { next(err); }
});

clientsRouter.post('/', requirePermission('clients:create'), async (req, res, next) => {
  try { res.status(201).json(await createClient(ctx(req), req.body)); } catch (err) { next(err); }
});

clientsRouter.get('/:id', requirePermission('clients:view'), async (req, res, next) => {
  try { res.json(await getClient(ctx(req), req.params.id!)); } catch (err) { next(err); }
});

clientsRouter.patch('/:id', requirePermission('clients:edit'), async (req, res, next) => {
  try { res.json(await updateClient(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

clientsRouter.post('/:id/contact', requirePermission('clients:edit'), async (req, res, next) => {
  try { res.json(await logClientContact(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

clientsRouter.put('/:id/requirements', requirePermission('clients:edit'), async (req, res, next) => {
  try { res.json(await saveClientRequirements(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

clientsRouter.get('/:id/timeline', requirePermission('clients:view'), async (req, res, next) => {
  try { res.json(await getClientTimeline(ctx(req), req.params.id!, req.query)); } catch (err) { next(err); }
});

clientsRouter.delete('/:id', requirePermission('clients:delete'), async (req, res, next) => {
  try { await deleteClient(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});
