import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { listRules, createRule, updateRule, deleteRule } from './rules.service';
import {
  listSequences, createSequence, updateSequence, deleteSequence,
  listEnrollments, cancelEnrollment,
} from './drip.service';

export const automationRouter = Router();
automationRouter.use(authenticate);
// Automation (auto-assignment rules + drip sequences) is a Growth+ feature.
automationRouter.use(requirePlanModule('automation'));

// --- Auto-assignment rules ---

automationRouter.get('/rules', requirePermission('automation:view'), async (req, res, next) => {
  try {
    res.json(await listRules(ctx(req)));
  } catch (err) {
    next(err);
  }
});

automationRouter.post('/rules', requirePermission('automation:create'), async (req, res, next) => {
  try {
    res.status(201).json(await createRule(ctx(req), req.body));
  } catch (err) {
    next(err);
  }
});

automationRouter.patch('/rules/:id', requirePermission('automation:edit'), async (req, res, next) => {
  try {
    res.json(await updateRule(ctx(req), req.params.id!, req.body));
  } catch (err) {
    next(err);
  }
});

automationRouter.delete('/rules/:id', requirePermission('automation:delete'), async (req, res, next) => {
  try {
    await deleteRule(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Drip sequences ---

automationRouter.get('/sequences', requirePermission('automation:view'), async (req, res, next) => {
  try {
    res.json(await listSequences(ctx(req)));
  } catch (err) {
    next(err);
  }
});

automationRouter.post('/sequences', requirePermission('automation:create'), async (req, res, next) => {
  try {
    res.status(201).json(await createSequence(ctx(req), req.body));
  } catch (err) {
    next(err);
  }
});

automationRouter.patch('/sequences/:id', requirePermission('automation:edit'), async (req, res, next) => {
  try {
    res.json(await updateSequence(ctx(req), req.params.id!, req.body));
  } catch (err) {
    next(err);
  }
});

automationRouter.delete('/sequences/:id', requirePermission('automation:delete'), async (req, res, next) => {
  try {
    await deleteSequence(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// --- Enrollments (read-only + cancel) ---

automationRouter.get('/enrollments', requirePermission('automation:view'), async (req, res, next) => {
  try {
    res.json(await listEnrollments(ctx(req), req.query));
  } catch (err) {
    next(err);
  }
});

automationRouter.post('/enrollments/:id/cancel', requirePermission('automation:edit'), async (req, res, next) => {
  try {
    await cancelEnrollment(ctx(req), req.params.id!);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
