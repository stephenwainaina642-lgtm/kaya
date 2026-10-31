import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { getOnboarding, dismissOnboarding } from './onboarding.service';

export const onboardingRouter = Router();
onboardingRouter.use(authenticate);

onboardingRouter.get('/', async (req, res, next) => {
  try {
    res.json(await getOnboarding(ctx(req)));
  } catch (err) {
    next(err);
  }
});

// Org-wide choice, so only someone who can edit workspace settings.
onboardingRouter.post('/dismiss', requirePermission('settings:edit'), async (req, res, next) => {
  try {
    res.json(await dismissOnboarding(ctx(req)));
  } catch (err) {
    next(err);
  }
});
