import { Router } from 'express';
import { authenticate, ctx } from '../../middleware/auth';
import { search } from './search.service';

export const searchRouter = Router();
searchRouter.use(authenticate);

searchRouter.get('/', async (req, res, next) => {
  try {
    res.json(await search(ctx(req), req.query));
  } catch (err) {
    next(err);
  }
});
