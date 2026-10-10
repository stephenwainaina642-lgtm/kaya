import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { calendarQuery, getCalendar } from './calendar.service';

export const calendarRouter = Router();
calendarRouter.use(authenticate);

calendarRouter.get('/', requirePermission('calendar:view'), async (req, res, next) => {
  try {
    const a = ctx(req);
    const q = calendarQuery.parse({ from: req.query.from, to: req.query.to });
    res.json(await getCalendar(a, q));
  } catch (err) {
    next(err);
  }
});
