import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';

// vi.hoisted runs before the (hoisted) imports, so env.ts sees these values.
vi.hoisted(() => {
  process.env.MPESA_CONSUMER_KEY = 'k';
  process.env.MPESA_CONSUMER_SECRET = 's';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'pk';
  process.env.MPESA_CALLBACK_SECRET = 'cb-secret-123';
});

let pushCounter = 0;
const stkQueryMock = vi.fn();
vi.mock('../lib/mpesa', async (orig) => {
  const real = await orig<typeof import('../lib/mpesa')>();
  return {
    ...real,
    stkPush: vi.fn(async () => ({ merchantRequestId: `m${++pushCounter}`, checkoutRequestId: `ws_CO_${pushCounter}` })),
    stkQuery: (...a: unknown[]) => stkQueryMock(...a),
  };
});

import { createApp } from '../app';
import { systemDb } from '../db/system';
import { organizations, billingPayments } from '../db/schema';
import { truncateAll, setupTenant, createUser } from './helpers';
import { effectivePlan, quoteKes } from '@kaya/shared';

const app = createApp();
const callback = (checkoutRequestId: string, code: number, amount?: number, receipt = 'QWE123ABC') =>
  request(app).post('/api/billing/mpesa/callback/cb-secret-123').send({
    Body: { stkCallback: {
      CheckoutRequestID: checkoutRequestId, ResultCode: code, ResultDesc: code === 0 ? 'ok' : 'Request cancelled by user',
      ...(code === 0 ? { CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: receipt }] } } : {}),
    } },
  });

describe('pricing and expiry rules', () => {
  it('quotes per seat, with annual = 10 months', () => {
    expect(quoteKes('GROWTH', 3, 1)).toBe(29700);
    expect(quoteKes('PRO', 2, 12)).toBe(16900 * 2 * 10);
  });
  it('keeps a lapsed plan for the grace period, then falls back to Starter', () => {
    const now = new Date('2026-06-10T00:00:00Z');
    expect(effectivePlan('PRO', null, now)).toBe('PRO');
    expect(effectivePlan('PRO', '2026-06-09T00:00:00Z', now)).toBe('PRO');
    expect(effectivePlan('PRO', '2026-06-01T00:00:00Z', now)).toBe('STARTER');
    expect(effectivePlan('STARTER', '2020-01-01T00:00:00Z', now)).toBe('STARTER');
  });
});

describe('M-Pesa billing', () => {
  beforeEach(async () => { await truncateAll(); stkQueryMock.mockReset(); pushCounter = 0; });

  it('upgrades the plan once the callback confirms payment, and ignores a replayed callback', async () => {
    const t = await setupTenant();
    const co = await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'GROWTH', months: 1, phone: '0712 345 678' });
    expect(co.status).toBe(201);
    expect(co.body).toMatchObject({ status: 'PENDING', plan: 'GROWTH', amount: 9900 });

    expect((await callback('ws_CO_1', 0, 9900)).status).toBe(200);
    const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, t.org.id));
    expect(org!.plan).toBe('GROWTH');
    const firstExpiry = org!.planExpiresAt!.getTime();
    expect(firstExpiry).toBeGreaterThan(Date.now() + 27 * 86_400_000);

    await callback('ws_CO_1', 0, 9900); // Safaricom retries
    const [again] = await systemDb.select().from(organizations).where(eq(organizations.id, t.org.id));
    expect(again!.planExpiresAt!.getTime()).toBe(firstExpiry);

    const overview = await request(app).get('/api/billing').set(t.authHeader);
    expect(overview.body.plan).toBe('GROWTH');
    expect(overview.body.payments[0]).toMatchObject({ status: 'PAID', mpesaReceipt: 'QWE123ABC' });
  });

  it('records a cancelled prompt as failed and leaves the plan alone', async () => {
    const t = await setupTenant();
    await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'PRO', months: 1, phone: '0712345678' });
    await callback('ws_CO_1', 1032);
    const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, t.org.id));
    expect(org!.plan).toBe('STARTER');
    const [pay] = await systemDb.select().from(billingPayments);
    expect(pay).toMatchObject({ status: 'FAILED', failureReason: 'Request cancelled by user' });
  });

  it('refuses to grant a plan when the paid amount is short', async () => {
    const t = await setupTenant();
    await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'PRO', months: 1, phone: '0712345678' });
    await callback('ws_CO_1', 0, 1);
    const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, t.org.id));
    expect(org!.plan).toBe('STARTER');
    expect((await systemDb.select().from(billingPayments))[0]!.status).toBe('FAILED');
  });

  it('extends from the current expiry when renewing early', async () => {
    const t = await setupTenant();
    await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'GROWTH', months: 1, phone: '0712345678' });
    await callback('ws_CO_1', 0, 9900);
    const [a] = await systemDb.select().from(organizations).where(eq(organizations.id, t.org.id));
    await systemDb.update(billingPayments).set({ createdAt: new Date(Date.now() - 10 * 60_000) });
    await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'GROWTH', months: 1, phone: '0712345678' });
    await callback('ws_CO_2', 0, 9900);
    const [b] = await systemDb.select().from(organizations).where(eq(organizations.id, t.org.id));
    const gap = (b!.planExpiresAt!.getTime() - a!.planExpiresAt!.getTime()) / 86_400_000;
    expect(gap).toBeGreaterThanOrEqual(28);
  });

  it('downgrades to Starter behaviour after the grace period lapses', async () => {
    const t = await setupTenant();
    await systemDb.update(organizations).set({ plan: 'PRO', planExpiresAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(organizations.id, t.org.id));
    expect((await request(app).get('/api/audit').set(t.authHeader)).status).toBe(403);
    await systemDb.update(organizations).set({ planExpiresAt: new Date(Date.now() + 86_400_000) }).where(eq(organizations.id, t.org.id));
    expect((await request(app).get('/api/audit').set(t.authHeader)).status).toBe(200);
  });

  it('rejects a bad callback secret, a second in-flight push, bad phones, and non-admins', async () => {
    const t = await setupTenant();
    expect((await request(app).post('/api/billing/mpesa/callback/wrong').send({})).status).toBe(404);
    expect((await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'GROWTH', months: 1, phone: '12345' })).status).toBe(422);
    expect((await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'STARTER', months: 1, phone: '0712345678' })).status).toBe(409);
    expect((await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'GROWTH', months: 1, phone: '0712345678' })).status).toBe(201);
    expect((await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'GROWTH', months: 1, phone: '0712345678' })).status).toBe(409);
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).get('/api/billing').set({ Authorization: `Bearer ${agent.token}` })).status).toBe(403);
  });

  it('falls back to asking Safaricom when the callback never arrives, and is tenant-scoped', async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const co = await request(app).post('/api/billing/checkout').set(t.authHeader).send({ plan: 'GROWTH', months: 1, phone: '0712345678' });
    await systemDb.update(billingPayments).set({ createdAt: new Date(Date.now() - 60_000) });
    stkQueryMock.mockResolvedValue({ resultCode: 0, resultDesc: 'ok' });
    const polled = await request(app).get(`/api/billing/payments/${co.body.id}`).set(t.authHeader);
    expect(polled.body.status).toBe('PAID');
    expect((await request(app).get(`/api/billing/payments/${co.body.id}`).set(other.authHeader)).status).toBe(404);
  });
});
