import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { testOutbox } from '../lib/mailer';
import { setStatementSchedule, sweepStatementEmails } from '../modules/rent/portal.service';
import type { Auth } from '../modules/crm/common';
import { setupTenant, truncateAll, createUser } from './helpers';

const app = createApp();

async function seed(h: Record<string, string>) {
  const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'Grace Wanjiru', phone: '+254722000001' })).body;
  const property = (await request(app).post('/api/properties').set(h).send({
    reference: 'PRP-1', title: 'Kilimani 2BR', listingType: 'RENT', propertyType: 'APARTMENT', price: 50_000, location: 'Kilimani', bedrooms: 2, bathrooms: 2, ownerId: owner.id,
  })).body;
  const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: 'Tenant Tom', phone: '+254733000009' })).body;
  await request(app).post('/api/rent/leases').set(h).send({ propertyId: property.id, tenantId: tenant.id, rentAmount: 50_000, dueDay: 5, startDate: '2026-01-01', feeBps: 1000 });
  return { owner, property };
}

describe('landlord portal', () => {
  beforeEach(truncateAll);

  it('gives a landlord a read-only view through a secret link that can be revoked', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { owner, property } = await seed(h);
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const charge = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-03' })).body[0];
    await request(app).post(`/api/rent/charges/${charge.id}/payments`).set(h).send({ amount: 50_000, method: 'CASH' });
    await request(app).post('/api/maintenance').set(h).send({ propertyId: property.id, title: 'Leaking tap' });

    expect((await request(app).get(`/api/rent/owners/${owner.id}/portal-link`).set(h)).body.token).toBeNull();
    const { token } = (await request(app).post(`/api/rent/owners/${owner.id}/portal-link`).set(h)).body;
    expect(token).toHaveLength(32);

    // No login needed.
    const view = await request(app).get(`/api/public/portal/${token}`).query({ period: '2026-03' });
    expect(view.status).toBe(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.body).toMatchObject({ ownerName: 'Grace Wanjiru', period: '2026-03' });
    expect(view.body.statement.totals).toMatchObject({ collected: 50_000, managementFee: 5_000, netToLandlord: 45_000 });
    expect(view.body.units).toHaveLength(1);
    expect(view.body.units[0]).toMatchObject({ propertyTitle: 'Kilimani 2BR', location: 'Kilimani', tenantName: 'Tenant Tom', rent: 50_000, state: 'LET', advertised: false, listingPath: null });
    expect(view.body.openRepairs).toHaveLength(1);
    // The business summary: a six-month trend ending at the chosen month, occupancy, and who is behind.
    expect(view.body.trend.map((x: { period: string }) => x.period)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
    expect(view.body.trend[5]).toMatchObject({ expected: 50_000, collected: 50_000, net: 45_000 });
    expect(view.body.trend[0]).toMatchObject({ expected: 0, collected: 0, net: 0 });
    expect(view.body.portfolio).toMatchObject({ units: 1, let: 1, vacant: 0, occupancy: 1, monthlyRent: 50_000, owedByTenants: 0 });
    expect(view.body.owing).toEqual([]);
    // Nothing that identifies tenants beyond a name, and no internal ids of other records.
    expect(JSON.stringify(view.body)).not.toContain('254733000009');

    // Re-issuing replaces the link; the old one dies immediately.
    const second = (await request(app).post(`/api/rent/owners/${owner.id}/portal-link`).set(h)).body.token;
    expect((await request(app).get(`/api/public/portal/${token}`)).status).toBe(404);
    expect((await request(app).get(`/api/public/portal/${second}`)).status).toBe(200);

    // Revoking removes it.
    expect((await request(app).delete(`/api/rent/owners/${owner.id}/portal-link`).set(h)).status).toBe(204);
    expect((await request(app).get(`/api/public/portal/${second}`)).status).toBe(404);
  });

  it('lists tenants who are behind, with how much and for how many months', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { owner } = await seed(h);
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-02' });
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const first = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-02' })).body[0];
    await request(app).post(`/api/rent/charges/${first.id}/payments`).set(h).send({ amount: 20_000, method: 'CASH' });
    const { token } = (await request(app).post(`/api/rent/owners/${owner.id}/portal-link`).set(h)).body;
    const view = (await request(app).get(`/api/public/portal/${token}`).query({ period: '2026-03' })).body;
    expect(view.owing).toEqual([{ propertyTitle: 'Kilimani 2BR', tenantName: 'Tenant Tom', amount: 80_000, months: 2 }]);
    expect(view.portfolio.owedByTenants).toBe(80_000);
  });

  it('refuses guesses, other plans and agents', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { owner } = await seed(h);
    expect((await request(app).get('/api/public/portal/not-a-real-token-at-all-1234')).status).toBe(404);
    expect((await request(app).get('/api/public/portal/short')).status).toBe(404);

    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post(`/api/rent/owners/${owner.id}/portal-link`).set({ Authorization: `Bearer ${agent.token}` })).status).toBe(403);

    // Another agency cannot mint a link for this landlord.
    const other = await setupTenant('ORG_ADMIN', 'GROWTH');
    expect((await request(app).post(`/api/rent/owners/${owner.id}/portal-link`).set(other.authHeader)).status).toBe(404);
  });
  it('emails a landlord their statement with a private link, and one bad address never stops a bulk send', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { owner } = await seed(h);
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const charge = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-03' })).body[0];
    await request(app).post(`/api/rent/charges/${charge.id}/payments`).set(h).send({ amount: 50_000, method: 'CASH' });

    // No email on file yet.
    expect((await request(app).post(`/api/rent/statements/${owner.id}/email`).set(h).send({ period: '2026-03' })).status).toBe(422);

    await request(app).patch(`/api/owners/${owner.id}`).set(h).send({ email: 'grace@example.com' });
    testOutbox.length = 0;
    const ok = await request(app).post(`/api/rent/statements/${owner.id}/email`).set(h).send({ period: '2026-03' });
    expect(ok.status).toBe(200);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]!.to).toBe('grace@example.com');
    expect(testOutbox[0]!.text).toContain('45,000');
    const token = (await request(app).get(`/api/rent/owners/${owner.id}/portal-link`).set(h)).body.token;
    expect(token).toBeTruthy();
    expect(testOutbox[0]!.text).toContain(`/portal/${token}`);

    // A month with no rent has nothing to send.
    expect((await request(app).post(`/api/rent/statements/${owner.id}/email`).set(h).send({ period: '2025-01' })).status).toBe(409);

    // Bulk: one landlord with rent, one without an email, one with no rent.
    await request(app).post('/api/owners').set(h).send({ fullName: 'No Email Owner', phone: '+254700000077' });
    await request(app).post('/api/owners').set(h).send({ fullName: 'Idle Owner', phone: '+254700000078', email: 'idle@example.com' });
    testOutbox.length = 0;
    const all = await request(app).post('/api/rent/statements/email-all').set(h).send({ period: '2026-03' });
    expect(all.body).toEqual({ sent: 1, noEmail: 1, nothingToSend: 1, failed: 0 });
    expect(testOutbox).toHaveLength(1);

    // Agents cannot send.
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post('/api/rent/statements/email-all').set({ Authorization: `Bearer ${agent.token}` }).send({})).status).toBe(403);
  });
  it('sends last month\'s statements automatically once on the chosen day, and never on enabling', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const { owner } = await seed(h);
    await request(app).patch(`/api/owners/${owner.id}`).set(h).send({ email: 'grace@example.com' });
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const charge = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-03' })).body[0];
    await request(app).post(`/api/rent/charges/${charge.id}/payments`).set(h).send({ amount: 50_000, method: 'CASH' });
    const auth = { organizationId: t.org.id, userId: null, role: 'ORG_ADMIN', name: 'x' } as unknown as Auth;

    expect((await request(app).put('/api/rent/statement-schedule').set(h).send({ day: 40 })).status).toBe(422);
    testOutbox.length = 0;

    // Off by default: nothing goes out.
    expect((await sweepStatementEmails(new Date('2026-04-10T08:00:00Z'))).sent).toBe(0);

    await setStatementSchedule(auth, { day: 5 }, new Date('2026-04-02T08:00:00Z'));
    expect((await request(app).get('/api/rent/statement-schedule').set(h)).body.day).toBe(5);
    expect((await sweepStatementEmails(new Date('2026-04-04T08:00:00Z'))).sent).toBe(0); // day not reached
    expect(await sweepStatementEmails(new Date('2026-04-10T08:00:00Z'))).toEqual({ organizations: 1, sent: 1 });
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]!.subject).toContain('March 2026');
    expect((await sweepStatementEmails(new Date('2026-04-11T08:00:00Z'))).sent).toBe(0); // once per month
    expect(testOutbox).toHaveLength(1);

    // Switching it on after the day has passed waits for next month instead of sending at once.
    await setStatementSchedule(auth, { day: null });
    await setStatementSchedule(auth, { day: 5 }, new Date('2026-05-20T08:00:00Z'));
    testOutbox.length = 0;
    expect((await sweepStatementEmails(new Date('2026-05-21T08:00:00Z'))).sent).toBe(0);

    // Agents cannot change it.
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).put('/api/rent/statement-schedule').set({ Authorization: `Bearer ${agent.token}` }).send({ day: 3 })).status).toBe(403);
  });
});
