import { Router } from 'express';
import { authenticate, ctx } from '../../middleware/auth';
import { getDashboard } from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/', async (req, res, next) => {
  try {
    const a = ctx(req);
    const data = await getDashboard(a);
    res.json(data);
  } catch (err) {
    next(err);
  }
});
