import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import {
  listLeads, getLead, createLead, updateLead, setLeadStatus, logLeadContact, saveLeadRequirements,
  getLeadTimeline, qualifyLead, deleteLead,
} from './leads.service';

export const leadsRouter = Router();
leadsRouter.use(authenticate);

leadsRouter.get('/', requirePermission('leads:view'), async (req, res, next) => {
  try { res.json(await listLeads(ctx(req), req.query)); } catch (err) { next(err); }
});

leadsRouter.post('/', requirePermission('leads:create'), async (req, res, next) => {
  try { res.status(201).json(await createLead(ctx(req), req.body)); } catch (err) { next(err); }
});

leadsRouter.get('/:id', requirePermission('leads:view'), async (req, res, next) => {
  try { res.json(await getLead(ctx(req), req.params.id!)); } catch (err) { next(err); }
});

leadsRouter.patch('/:id', requirePermission('leads:edit'), async (req, res, next) => {
  try { res.json(await updateLead(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

leadsRouter.post('/:id/status', requirePermission('leads:edit'), async (req, res, next) => {
  try { res.json(await setLeadStatus(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

leadsRouter.post('/:id/contact', requirePermission('leads:edit'), async (req, res, next) => {
  try { res.json(await logLeadContact(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

leadsRouter.put('/:id/requirements', requirePermission('leads:edit'), async (req, res, next) => {
  try { res.json(await saveLeadRequirements(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

leadsRouter.get('/:id/timeline', requirePermission('leads:view'), async (req, res, next) => {
  try { res.json(await getLeadTimeline(ctx(req), req.params.id!, req.query)); } catch (err) { next(err); }
});

leadsRouter.post('/:id/qualify', requirePermission('leads:edit'), async (req, res, next) => {
  try { res.json(await qualifyLead(ctx(req), req.params.id!)); } catch (err) { next(err); }
});

leadsRouter.delete('/:id', requirePermission('leads:delete'), async (req, res, next) => {
  try { await deleteLead(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});
