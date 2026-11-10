import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Daraja itself can't be called from tests: stub the network edge, keep everything else real.
const push = vi.fn(async () => ({ merchantRequestId: 'm1', checkoutRequestId: `ws_CO_${Math.random().toString(36).slice(2)}` }));
vi.mock('../lib/mpesa', async (orig) => ({
  ...(await orig<typeof import('../lib/mpesa')>()),
  checkCredentials: vi.fn(async (c: { consumerKey: string }) => c.consumerKey !== 'bad'),
  stkPush: (...a: unknown[]) => (push as (...x: unknown[]) => unknown)(...a),
  stkQuery: vi.fn(async () => null),
}));

import { createApp } from '../app';
import { setupTenant, truncateAll } from './helpers';
import { encryptSecret, decryptSecret } from '../lib/secrets';

const app = createApp();

describe('secrets', () => {
  it('round-trips and refuses tampered or foreign blobs', () => {
    const blob = encryptSecret('super-secret');
    expect(blob).not.toContain('super-secret');
    expect(decryptSecret(blob)).toBe('super-secret');
    expect(decryptSecret(blob.slice(0, -3) + 'abc')).toBeNull();
    expect(decryptSecret('garbage')).toBeNull();
  });
});

describe('tenant pays rent from the portal', () => {
  beforeEach(async () => { await truncateAll(); push.mockClear(); });

  async function seed() {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'O', phone: '0722000001' })).body;
    const prop = (await request(app).post('/api/properties').set(h).send({
      title: 'Unit 1', reference: 'U-1', listingType: 'RENT', propertyType: 'APARTMENT', price: 20000, location: 'X', bathrooms: 1, ownerId: owner.id,
    })).body;
    const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tina Tenant', phone: '0712345678' })).body;
    const lease = (await request(app).post('/api/rent/leases').set(h).send({ propertyId: prop.id, tenantId: tenant.id, rentAmount: 20000, dueDay: 1, startDate: '2025-01-01' })).body;
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2025-02' });
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2025-03' });
    const token = (await request(app).post(`/api/rent/leases/${lease.id}/portal-link`).set(h)).body.token;
    return { t, h, token, lease };
  }
  const keys = { mode: 'sandbox', accountType: 'PAYBILL', shortcode: '174379', consumerKey: 'ck', consumerSecret: 'cs', passkey: 'pk' };

  it('is unavailable until the agency adds its own M-Pesa keys, and rejects bad keys', async () => {
    const { h, token } = await seed();
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).body.canPayNow).toBe(false);
    expect((await request(app).post(`/api/public/tenant-portal/${token}/pay`).send({})).status).toBe(409);
    expect((await request(app).put('/api/rent/mpesa-settings').set(h).send({ ...keys, consumerKey: 'bad' })).status).toBe(422);
    expect((await request(app).put('/api/rent/mpesa-settings').set(h).send({ ...keys, shortcode: 'abc' })).status).toBe(422);
    const ok = await request(app).put('/api/rent/mpesa-settings').set(h).send(keys);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ configured: true, shortcode: '174379' });
    expect(JSON.stringify(ok.body)).not.toContain('cs');
    expect(JSON.stringify((await request(app).get('/api/rent/mpesa-settings').set(h)).body)).not.toMatch(/passkey|pk"/);
    // Keeping saved secrets when left blank
    expect((await request(app).put('/api/rent/mpesa-settings').set(h).send({ mode: 'sandbox', accountType: 'TILL', shortcode: '654321' })).status).toBe(200);
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).body.canPayNow).toBe(true);
  });

  it('sends a prompt, records the real amount on the callback, oldest month first, exactly once', async () => {
    const { h, token } = await seed();
    const cfg = (await request(app).put('/api/rent/mpesa-settings').set(h).send(keys)).body;
    const secret = cfg.callbackUrl.split('/').pop();

    const started = await request(app).post(`/api/public/tenant-portal/${token}/pay`).send({ amount: 25_000 });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ status: 'PENDING', amount: 25_000 });
    expect(push).toHaveBeenCalledTimes(1);
    expect((push.mock.calls[0] as unknown[])[0]).toMatchObject({ msisdn: '254712345678', amount: 25_000 });
    // A second tap straight away is held back.
    expect((await request(app).post(`/api/public/tenant-portal/${token}/pay`).send({})).status).toBe(429);

    const checkout = (await request(app).get(`/api/public/tenant-portal/${token}/pay/${started.body.id}`)).body;
    expect(checkout.status).toBe('PENDING');
    const callback = (receipt: string, amount: number, code = 0) => ({
      Body: { stkCallback: { CheckoutRequestID: 'will-be-replaced', ResultCode: code, ResultDesc: code ? 'Cancelled by user' : 'ok',
        CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: receipt }] } } },
    });
    const { systemDb } = await import('../db/system');
    const { rentStkRequests } = await import('../db/schema');
    const [row] = await systemDb.select().from(rentStkRequests);
    const body = callback('QWE123ABCD', 25_000);
    body.Body.stkCallback.CheckoutRequestID = row!.checkoutRequestId;

    // Wrong secret does nothing; right secret settles.
    await request(app).post('/api/public/mpesa/rent/' + 'x'.repeat(30)).send(body);
    expect((await request(app).get(`/api/public/tenant-portal/${token}/pay/${started.body.id}`)).body.status).toBe('PENDING');
    expect((await request(app).post(`/api/public/mpesa/rent/${secret}`).send(body)).status).toBe(200);
    await request(app).post(`/api/public/mpesa/rent/${secret}`).send(body); // Safaricom retry

    const done = (await request(app).get(`/api/public/tenant-portal/${token}/pay/${started.body.id}`)).body;
    expect(done).toMatchObject({ status: 'PAID', receipt: 'QWE123ABCD' });
    const view = (await request(app).get(`/api/public/tenant-portal/${token}`)).body;
    expect(view.statement.totals).toMatchObject({ charged: 40_000, paid: 25_000, balance: 15_000 });
    const rows = view.statement.rows;
    expect(rows.find((r: { period: string }) => r.period === '2025-02').paid).toBe(20_000);
    expect(rows.find((r: { period: string }) => r.period === '2025-03').paid).toBe(5_000);
  });

  it('marks a cancelled prompt as failed and never records money', async () => {
    const { h, token } = await seed();
    const cfg = (await request(app).put('/api/rent/mpesa-settings').set(h).send(keys)).body;
    const started = (await request(app).post(`/api/public/tenant-portal/${token}/pay`).send({})).body;
    expect(started.amount).toBe(40_000);
    const { systemDb } = await import('../db/system');
    const { rentStkRequests } = await import('../db/schema');
    const [row] = await systemDb.select().from(rentStkRequests);
    await request(app).post(`/api/public/mpesa/rent/${cfg.callbackUrl.split('/').pop()}`).send({ Body: { stkCallback: { CheckoutRequestID: row!.checkoutRequestId, ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } });
    expect((await request(app).get(`/api/public/tenant-portal/${token}/pay/${started.id}`)).body).toMatchObject({ status: 'FAILED', message: 'Request cancelled by user' });
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).body.statement.totals.paid).toBe(0);
  });

  it("won't let one agency's token or secret touch another's payments", async () => {
    const a = await seed();
    const cfgA = (await request(app).put('/api/rent/mpesa-settings').set(a.h).send(keys)).body;
    const started = (await request(app).post(`/api/public/tenant-portal/${a.token}/pay`).send({})).body;
    expect((await request(app).get(`/api/public/tenant-portal/${'z'.repeat(32)}/pay/${started.id}`)).status).toBe(404);
    const b = await setupTenant('ORG_ADMIN', 'GROWTH');
    const cfgB = (await request(app).put('/api/rent/mpesa-settings').set(b.authHeader).send(keys)).body;
    const { systemDb } = await import('../db/system');
    const { rentStkRequests } = await import('../db/schema');
    const [row] = await systemDb.select().from(rentStkRequests);
    await request(app).post(`/api/public/mpesa/rent/${cfgB.callbackUrl.split('/').pop()}`).send({
      Body: { stkCallback: { CheckoutRequestID: row!.checkoutRequestId, ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'Amount', Value: 40000 }, { Name: 'MpesaReceiptNumber', Value: 'EVIL1' }] } } },
    });
    expect((await request(app).get(`/api/public/tenant-portal/${a.token}/pay/${started.id}`)).body.status).toBe('PENDING');
    expect(cfgA.callbackUrl).not.toBe(cfgB.callbackUrl);
  });
});
