import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser } from './helpers';
import { systemDb } from '../db/system';
import { organizations } from '../db/schema';
import { eq } from 'drizzle-orm';

const app = createApp();

describe('public inquiry form', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('returns the agency name for a valid slug, and 404 for an unknown one', async () => {
    const { org } = await setupTenant('ORG_ADMIN', 'STARTER');
    const ok = await request(app).get(`/api/public/organizations/${org.slug}`);
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Test Realty');

    const missing = await request(app).get('/api/public/organizations/does-not-exist');
    expect(missing.status).toBe(404);
  });

  it('404s for a suspended agency rather than accepting inquiries', async () => {
    const { org } = await setupTenant('ORG_ADMIN', 'STARTER');
    await systemDb.update(organizations).set({ suspendedAt: new Date() }).where(eq(organizations.id, org.id));

    const res = await request(app).get(`/api/public/organizations/${org.slug}`);
    expect(res.status).toBe(404);
  });

  it('creates a real, auto-assigned lead from a public submission, with no auth required', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const agent = await createUser(org.id, { name: 'Dedicated Agent', role: 'AGENT', email: 'dedicated@test.kaya' });
    await request(app).post('/api/automation/rules').set(authHeader).send({
      name: 'Website leads to Dedicated Agent', strategy: 'SPECIFIC_AGENT', specificAgentId: agent.id, sourceFilter: 'WEBSITE',
    });

    const res = await request(app).post(`/api/public/organizations/${org.slug}/inquiries`).send({
      fullName: 'Grace Wanjiru', phone: '+254700555123', email: 'grace@example.com', leadType: 'BUYER',
      message: 'Looking for a 2BR in Kilimani under 15M',
    });
    expect(res.status).toBe(201);

    const leads = await request(app).get('/api/leads').set(authHeader);
    const created = leads.body.items.find((l: any) => l.phone === '+254700555123');
    expect(created).toBeTruthy();
    expect(created.source).toBe('WEBSITE');
    expect(created.assignedAgent.id).toBe(agent.id); // the automation rule actually ran

    const detail = await request(app).get(`/api/leads/${created.id}`).set(authHeader);
    expect(detail.body.notes).toContain('2BR in Kilimani');
  });

  it('does not create a duplicate lead for a phone number already in the CRM — logs an activity instead', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const existing = await request(app).post('/api/leads').set(authHeader).send({
      fullName: 'Existing Lead', phone: '+254700999888', source: 'REFERRAL',
    });

    const res = await request(app).post(`/api/public/organizations/${org.slug}/inquiries`).send({
      fullName: 'Existing Lead', phone: '+254700999888', leadType: 'BUYER', message: 'Still interested?',
    });
    expect(res.status).toBe(201);

    const leads = await request(app).get('/api/leads').set(authHeader);
    const matches = leads.body.items.filter((l: any) => l.phone === '+254700999888');
    expect(matches).toHaveLength(1); // no duplicate created

    const timeline = await request(app).get(`/api/leads/${existing.body.id}/timeline`).set(authHeader);
    const activityTitles = timeline.body.items.map((i: any) => i.title ?? i.body ?? '').join(' ');
    expect(activityTitles).toContain('inquiry');
  });

  it('silently ignores a submission with the honeypot field filled in', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');

    const res = await request(app).post(`/api/public/organizations/${org.slug}/inquiries`).send({
      fullName: 'A Bot', phone: '+254700111222', leadType: 'BUYER', website: 'http://spam.example',
    });
    expect(res.status).toBe(201); // never reveal to the bot that it was rejected

    const leads = await request(app).get('/api/leads').set(authHeader);
    expect(leads.body.items.find((l: any) => l.phone === '+254700111222')).toBeFalsy();
  });

  it('returns the org slug on the authenticated inquiry-link endpoint', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'STARTER');
    const res = await request(app).get('/api/leads/inquiry-link').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(org.slug);
  });
});
