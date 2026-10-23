import { Router } from 'express';
import { authenticatePlatform, platformCtx } from '../../middleware/platformAuth';
import { createLoginLimiter } from '../../middleware/rateLimit';
import {
  platformLogin, listOrganizations, getOrganization, updateOrganization, getStats,
} from './platform-admin.service';

export const platformAdminRouter = Router();
const loginLimiter = createLoginLimiter();

platformAdminRouter.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    res.json(await platformLogin(req.body));
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.get('/auth/me', authenticatePlatform, (req, res) => {
  const a = platformCtx(req);
  res.json({ id: a.adminId, email: a.email, name: a.name });
});

platformAdminRouter.use(authenticatePlatform);

platformAdminRouter.get('/stats', async (_req, res, next) => {
  try {
    res.json(await getStats());
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.get('/organizations', async (_req, res, next) => {
  try {
    res.json(await listOrganizations());
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.get('/organizations/:id', async (req, res, next) => {
  try {
    res.json(await getOrganization(req.params.id!));
  } catch (err) {
    next(err);
  }
});

platformAdminRouter.patch('/organizations/:id', async (req, res, next) => {
  try {
    res.json(await updateOrganization(req.params.id!, req.body));
  } catch (err) {
    next(err);
  }
});
