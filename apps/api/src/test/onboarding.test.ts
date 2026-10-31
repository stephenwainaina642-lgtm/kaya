import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser, createOrg } from './helpers';

const app = createApp();
const done = (body: { steps: { key: string; done: boolean }[] }) =>
  Object.fromEntries(body.steps.map((s) => [s.key, s.done]));

describe('onboarding checklist', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('starts with only the account-creation work done, then ticks steps as real work appears', async () => {
    const { org, authHeader } = await setupTenant();
    const first = await request(app).get('/api/onboarding').set(authHeader);
    expect(first.status).toBe(200);
    expect(first.body.completed).toBe(0);
    expect(first.body.total).toBe(5);
    expect(first.body.dismissed).toBe(false);

    await request(app).post('/api/leads').set(authHeader).send({ fullName: 'A Lead', phone: '+254700111222', source: 'WEBSITE' });
    await createUser(org.id, { role: 'AGENT' });
    await request(app).patch('/api/org/branding').set(authHeader).send({ brandColor: '#2F5D4E' });

    const next = await request(app).get('/api/onboarding').set(authHeader);
    expect(done(next.body)).toEqual({ branding: true, property: false, lead: true, teammate: true, viewing: false });
    expect(next.body.completed).toBe(3);
  });

  it('only counts the caller\'s own agency', async () => {
    const a = await setupTenant();
    const other = await createOrg('Other Realty');
    await createUser(other.id, { role: 'AGENT' });
    await createUser(other.id, { role: 'AGENT' });
    const res = await request(app).get('/api/onboarding').set(a.authHeader);
    expect(done(res.body).teammate).toBe(false);
  });

  it('lets an org admin dismiss it, but not an agent', async () => {
    const { org, authHeader } = await setupTenant();
    const agent = await createUser(org.id, { role: 'AGENT' });
    const denied = await request(app).post('/api/onboarding/dismiss').set({ Authorization: `Bearer ${agent.token}` });
    expect(denied.status).toBe(403);
    const ok = await request(app).post('/api/onboarding/dismiss').set(authHeader);
    expect(ok.status).toBe(200);
    expect(ok.body.dismissed).toBe(true);
    expect((await request(app).get('/api/onboarding').set(authHeader)).body.dismissed).toBe(true);
  });
});
