import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { getBoard, getDeal, createDeal, updateDeal, moveDealStage, deleteDeal } from './deals.service';
import { addOffer, setOfferStatus } from './offers.service';
import { listCommissions, recordPayment } from './commissions.service';

export const dealsRouter = Router();
dealsRouter.use(authenticate);
// Deal pipeline + commissions are a Growth-and-up feature (see pricing table).
dealsRouter.use(requirePlanModule('dealsPipeline'));

dealsRouter.get('/board', requirePermission('deals:view'), async (req, res, next) => {
  try { res.json(await getBoard(ctx(req))); } catch (err) { next(err); }
});

dealsRouter.get('/commissions', requirePermission('commissions:view'), async (req, res, next) => {
  try { res.json(await listCommissions(ctx(req), req.query)); } catch (err) { next(err); }
});

dealsRouter.post('/commissions/:id/payments', requirePermission('commissions:edit'), async (req, res, next) => {
  try { await recordPayment(ctx(req), req.params.id!, req.body); res.status(204).end(); } catch (err) { next(err); }
});

dealsRouter.get('/:id', requirePermission('deals:view'), async (req, res, next) => {
  try { res.json(await getDeal(ctx(req), req.params.id!)); } catch (err) { next(err); }
});

dealsRouter.post('/', requirePermission('deals:create'), async (req, res, next) => {
  try { res.status(201).json(await createDeal(ctx(req), req.body)); } catch (err) { next(err); }
});

dealsRouter.patch('/:id', requirePermission('deals:edit'), async (req, res, next) => {
  try { res.json(await updateDeal(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

dealsRouter.post('/:id/stage', requirePermission('deals:edit'), async (req, res, next) => {
  try { res.json(await moveDealStage(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

dealsRouter.delete('/:id', requirePermission('deals:delete'), async (req, res, next) => {
  try { await deleteDeal(ctx(req), req.params.id!); res.status(204).end(); } catch (err) { next(err); }
});

dealsRouter.post('/:id/offers', requirePermission('deals:edit'), async (req, res, next) => {
  try { res.status(201).json(await addOffer(ctx(req), req.params.id!, req.body)); } catch (err) { next(err); }
});

dealsRouter.post('/:id/offers/:offerId/status', requirePermission('deals:edit'), async (req, res, next) => {
  try { res.json(await setOfferStatus(ctx(req), req.params.id!, req.params.offerId!, req.body)); } catch (err) { next(err); }
});
