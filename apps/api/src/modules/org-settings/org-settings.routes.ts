import { Router } from 'express';
import multer from 'multer';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { getBranding, updateBranding, uploadLogo, removeLogo } from './org-settings.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const orgSettingsRouter = Router();
orgSettingsRouter.use(authenticate);

orgSettingsRouter.get('/branding', requirePermission('settings:view'), async (req, res, next) => {
  try {
    res.json(await getBranding(ctx(req)));
  } catch (err) {
    next(err);
  }
});

orgSettingsRouter.patch('/branding', requirePermission('settings:edit'), async (req, res, next) => {
  try {
    res.json(await updateBranding(ctx(req), req.body));
  } catch (err) {
    next(err);
  }
});

orgSettingsRouter.post('/logo', requirePermission('settings:edit'), upload.single('file'), async (req, res, next) => {
  try {
    res.status(201).json(await uploadLogo(ctx(req), req.file));
  } catch (err) {
    next(err);
  }
});

orgSettingsRouter.delete('/logo', requirePermission('settings:edit'), async (req, res, next) => {
  try {
    res.json(await removeLogo(ctx(req)));
  } catch (err) {
    next(err);
  }
});
