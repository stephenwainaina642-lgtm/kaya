import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { isAiConfigured, aiNotConfigured } from '../../lib/ai';
import { parse } from '../../lib/validate';
import { uuidField } from '../crm/common';
import { collectionsPlan } from './collections.service';
import { renewalSuggestion } from './renewal.service';
import { scoreLead, draftMessage, draftMessageInput, summarizeContact, summarizeInput, nextBestActions } from './ai.service';

export const aiRouter = Router();
aiRouter.use(authenticate);
aiRouter.use(requirePlanModule('aiInsights'));
aiRouter.use((_req, _res, next) => {
  if (!isAiConfigured()) {
    next(aiNotConfigured());
    return;
  }
  next();
});

aiRouter.post('/leads/:id/score', async (req, res, next) => {
  try {
    const id = parse(uuidField, req.params.id);
    res.json(await scoreLead(ctx(req), id));
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/draft-message', async (req, res, next) => {
  try {
    const input = parse(draftMessageInput, req.body);
    res.json(await draftMessage(ctx(req), input));
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/summarize', async (req, res, next) => {
  try {
    const input = parse(summarizeInput, req.body);
    res.json(await summarizeContact(ctx(req), input));
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/next-actions', async (req, res, next) => {
  try {
    res.json(await nextBestActions(ctx(req)));
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/rent/collections-plan', requirePlanModule('rentManagement'), requirePermission('rent:edit'), async (req, res, next) => {
  try {
    res.json(await collectionsPlan(ctx(req)));
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/rent/leases/:id/renewal', requirePlanModule('rentManagement'), requirePermission('rent:edit'), async (req, res, next) => {
  try {
    res.json(await renewalSuggestion(ctx(req), req.params.id!));
  } catch (err) {
    next(err);
  }
});
