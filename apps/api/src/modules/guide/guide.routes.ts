import { Router } from 'express';
import { authenticate, ctx } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimit';
import { askGuide } from './guide.service';

export const guideRouter = Router();
guideRouter.use(authenticate);

guideRouter.post('/ask', aiLimiter, async (req, res, next) => {
  try { res.json(await askGuide(ctx(req), req.body)); } catch (err) { next(err); }
});
