import { Router } from 'express';
import { authenticate, ctx, requirePermission } from '../../middleware/auth';
import { getBilling, startCheckout, getPayment, handleMpesaCallback, isValidCallbackSecret } from './billing.service';

export const billingRouter = Router();

// Public: Safaricom posts here. Authenticated by the secret in the path, as
// Daraja callbacks carry no signature. Always acknowledges so Safaricom
// doesn't retry; processing problems are logged, not leaked.
billingRouter.post('/mpesa/callback/:secret', async (req, res) => {
  if (!isValidCallbackSecret(req.params.secret ?? '')) {
    res.status(404).end();
    return;
  }
  try {
    await handleMpesaCallback(req.body);
  } catch (err) {
    console.error('[billing] M-Pesa callback processing failed', err);
  }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

billingRouter.use(authenticate);

billingRouter.get('/', requirePermission('settings:edit'), async (req, res, next) => {
  try { res.json(await getBilling(ctx(req))); } catch (err) { next(err); }
});

billingRouter.post('/checkout', requirePermission('settings:edit'), async (req, res, next) => {
  try { res.status(201).json(await startCheckout(ctx(req), req.body)); } catch (err) { next(err); }
});

billingRouter.get('/payments/:id', requirePermission('settings:edit'), async (req, res, next) => {
  try { res.json(await getPayment(ctx(req), req.params.id!)); } catch (err) { next(err); }
});
