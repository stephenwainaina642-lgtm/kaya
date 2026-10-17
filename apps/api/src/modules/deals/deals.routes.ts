import { Router } from 'express';
import { authenticate, ctx } from '../../middleware/auth';
import { requirePlanModule } from '../../middleware/plan';
import { getBoard, getDeal, createDeal, updateDeal, moveDealStage, deleteDeal } from './deals.service';
import { addOffer, setOfferStatus } from './offers.service';
import { listCommissions, recordPayment } from './commissions.service';

export const dealsRouter = Router();
dealsRouter.use(authenticate);
// Deal pipeline + commissions are a Growth-and-up feature (see pricing table).
dealsRouter.use(requirePlanModule('dealsPipeline'));

dealsRouter.get('/board', async (req, res) => {
  res.json(await getBoard(ctx(req)));
});

dealsRouter.get('/commissions', async (req, res) => {
  res.json(await listCommissions(ctx(req), req.query));
});

dealsRouter.post('/commissions/:id/payments', async (req, res) => {
  await recordPayment(ctx(req), req.params.id, req.body);
  res.status(204).end();
});

dealsRouter.get('/:id', async (req, res) => {
  res.json(await getDeal(ctx(req), req.params.id));
});

dealsRouter.post('/', async (req, res) => {
  res.status(201).json(await createDeal(ctx(req), req.body));
});

dealsRouter.patch('/:id', async (req, res) => {
  res.json(await updateDeal(ctx(req), req.params.id, req.body));
});

dealsRouter.post('/:id/stage', async (req, res) => {
  res.json(await moveDealStage(ctx(req), req.params.id, req.body));
});

dealsRouter.delete('/:id', async (req, res) => {
  await deleteDeal(ctx(req), req.params.id);
  res.status(204).end();
});

dealsRouter.post('/:id/offers', async (req, res) => {
  res.status(201).json(await addOffer(ctx(req), req.params.id, req.body));
});

dealsRouter.post('/:id/offers/:offerId/status', async (req, res) => {
  res.json(await setOfferStatus(ctx(req), req.params.id, req.params.offerId, req.body));
});
