import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { testSmsOutbox } from '../lib/sms';
import { sendRentReminders, sweepAutoReminders } from '../modules/rent/reminders.service';
import type { Auth } from '../modules/crm/common';
import { setupTenant, truncateAll, createUser } from './helpers';

const app = createApp();

async function lease(h: Record<string, string>, ref: string, name: string, phone: string) {
  const owner = (await request(app).post('/api/owners').set(h).send({ fullName: `Owner ${ref}`, phone: '+254700000001' })).body;
  const property = (await request(app).post('/api/properties').set(h).send({
    reference: ref, title: `Flat ${ref}`, listingType: 'RENT', propertyType: 'APARTMENT', price: 30_000, location: 'Kilimani', bedrooms: 1, bathrooms: 1, ownerId: owner.id,
  })).body;
  const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: name, phone })).body;
  await request(app).post('/api/rent/leases').set(h).send({ propertyId: property.id, tenantId: tenant.id, rentAmount: 30_000, dueDay: 5, startDate: '2026-01-01' });
}

describe('rent reminders', () => {
  beforeEach(truncateAll);

  it('texts each overdue tenant once with balance and link, skipping no-phone and recently reminded', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    await lease(h, 'A1', 'Tom Otieno', '0722 111 222');
    await lease(h, 'A2', 'No Phone', '12345');
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-02' });
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    testSmsOutbox.length = 0;

    const res = await request(app).post('/api/rent/reminders').set(h);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 1, noPhone: 1, recentlyReminded: 0, failed: 0, smsConfigured: true });
    expect(testSmsOutbox).toHaveLength(1);
    expect(testSmsOutbox[0]!.to).toBe('+254722111222');
    expect(testSmsOutbox[0]!.text).toContain('60,000');
    expect(testSmsOutbox[0]!.text).toContain('2 months');
    const token = /\/tenant\/([\w-]+)/.exec(testSmsOutbox[0]!.text)![1];
    expect((await request(app).get(`/api/public/tenant-portal/${token}`)).status).toBe(200);

    // Pressing again right away does not text anyone twice.
    const again = await request(app).post('/api/rent/reminders').set(h);
    expect(again.body).toMatchObject({ sent: 0, recentlyReminded: 1 });
    expect(testSmsOutbox).toHaveLength(1);

    // After the cooldown they are reminded again.
    const auth = { organizationId: t.org.id, userId: null, role: 'ORG_ADMIN', name: 'x' } as unknown as Auth;
    const later = await sendRentReminders(auth, new Date(Date.now() + 4 * 86_400_000));
    expect(later.sent).toBe(1);
  });

  it('is manager-only and leaves paid tenants alone', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    await lease(h, 'B1', 'Paid Pat', '0733000111');
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const charge = (await request(app).get('/api/rent/charges').set(h).query({ period: '2026-03' })).body[0];
    await request(app).post(`/api/rent/charges/${charge.id}/payments`).set(h).send({ amount: 30_000, method: 'CASH' });
    testSmsOutbox.length = 0;
    expect((await request(app).post('/api/rent/reminders').set(h)).body.sent).toBe(0);
    expect(testSmsOutbox).toHaveLength(0);
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post('/api/rent/reminders').set({ Authorization: `Bearer ${agent.token}` })).status).toBe(403);
  });

  it('texts overdue tenants automatically once a day, never the day it is switched on, and only when enabled', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    await lease(h, 'B1', 'Tom Otieno', '0722 111 222');
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-02' });
    const day = (n: number) => { const d = new Date(Date.now() + n * 86_400_000); d.setUTCHours(12, 0, 0, 0); return d; };
    testSmsOutbox.length = 0;

    expect((await sweepAutoReminders(day(2))).sent).toBe(0); // off by default
    expect((await request(app).put('/api/rent/auto-reminders').set(h).send({ enabled: true })).body.enabled).toBe(true);
    expect((await sweepAutoReminders(new Date())).sent).toBe(0); // same day as switching on
    const early = day(1); early.setUTCHours(1, 0, 0, 0); // 04:00 in Nairobi
    expect((await sweepAutoReminders(early)).sent).toBe(0);
    expect(await sweepAutoReminders(day(2))).toEqual({ organizations: 1, sent: 1 });
    expect(testSmsOutbox).toHaveLength(1);
    expect((await sweepAutoReminders(day(2))).sent).toBe(0); // already ran that day
    expect((await request(app).put('/api/rent/auto-reminders').set(h).send({ enabled: 'yes' })).status).toBe(422);
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).put('/api/rent/auto-reminders').set({ Authorization: `Bearer ${agent.token}` }).send({ enabled: false })).status).toBe(403);
  });

  it('writes the reminder in the tenant\'s language and opens their link in it', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    await lease(h, 'L1', 'Amina Said', '0722 333 444');
    const client = (await request(app).get('/api/clients').set(h)).body.items[0];
    expect((await request(app).get(`/api/clients/${client.id}`).set(h)).body.language).toBe('en');
    expect((await request(app).patch(`/api/clients/${client.id}`).set(h).send({ language: 'xx' })).status).toBe(422);
    const saved = await request(app).patch(`/api/clients/${client.id}`).set(h).send({ language: 'sw' });
    expect(saved.body.language).toBe('sw');
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-02' });
    testSmsOutbox.length = 0;
    await request(app).post('/api/rent/reminders').set(h).send({});
    expect(testSmsOutbox).toHaveLength(1);
    expect(testSmsOutbox[0]!.text).toContain('Habari Amina');
    expect(testSmsOutbox[0]!.text).toContain('imechelewa');
    expect(testSmsOutbox[0]!.text).toMatch(/\/tenant\/[A-Za-z0-9_-]+\?lng=sw/);
  });
});
