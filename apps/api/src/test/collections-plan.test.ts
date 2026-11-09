import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { buildPlan, caseToPrompt, gatherCases, type CollectionsCase } from '../modules/ai/collections.service';
import type { Auth } from '../modules/crm/common';
import { setupTenant, truncateAll, createUser } from './helpers';

const app = createApp();

const base: CollectionsCase = {
  leaseId: 'L1', tenantName: 'Tom Otieno', tenantPhone: '+254722111222', propertyTitle: 'Flat A1', rent: 30_000, owed: 60_000, monthsOverdue: 2, oldestDaysLate: 40,
  history: ['ON_TIME', 'LATE', 'UNPAID', 'UNPAID'],
};

describe('AI collections plan', () => {
  beforeEach(truncateAll);

  it('sends the model a first name and numbers only', () => {
    const line = caseToPrompt(base, 1);
    expect(line).toContain('Tom');
    expect(line).not.toContain('Otieno');
    expect(line).not.toContain('254722111222');
    expect(line).toContain('owes 60000');
  });

  it('keeps only real tenants, bounds text and repairs bad labels', () => {
    const second = { ...base, leaseId: 'L2', tenantName: 'Amina K' };
    const plan = buildPlan([base, second], {
      briefing: 'x'.repeat(2000),
      tenants: [
        { n: 2, risk: 'HIGH', reason: 'r', action: 'a', message: 'Habari Amina' },
        { n: 1, risk: 'SCARY', reason: 'r', action: 'a', message: 'Habari Tom' },
        { n: 1, risk: 'LOW', reason: 'dup', action: 'a', message: 'dup' }, // duplicate ignored
        { n: 9, risk: 'LOW', reason: 'invented', action: 'a', message: 'ghost' }, // not one of ours
        { n: 2, message: '' }, // no message
      ],
    }, 3);
    expect(plan.briefing).toHaveLength(600);
    expect(plan.omitted).toBe(3);
    expect(plan.items.map((i) => [i.leaseId, i.risk])).toEqual([['L2', 'HIGH'], ['L1', 'MEDIUM']]);
    expect(plan.items[1]!.tenantPhone).toBe('+254722111222');
  });

  it('finds overdue active leases with their payment pattern, biggest balance first', async () => {
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const h = t.authHeader;
    const owner = (await request(app).post('/api/owners').set(h).send({ fullName: 'O', phone: '+254700000001' })).body;
    for (const [ref, rent] of [['S1', 20_000], ['B1', 50_000]] as const) {
      const property = (await request(app).post('/api/properties').set(h).send({
        reference: ref, title: `Flat ${ref}`, listingType: 'RENT', propertyType: 'APARTMENT', price: rent, location: 'K', bedrooms: 1, bathrooms: 1, ownerId: owner.id,
      })).body;
      const tenant = (await request(app).post('/api/clients').set(h).send({ fullName: `T ${ref}`, phone: ref === 'S1' ? '0722333444' : '0733444555' })).body;
      await request(app).post('/api/rent/leases').set(h).send({ propertyId: property.id, tenantId: tenant.id, rentAmount: rent, dueDay: 5, startDate: '2026-01-01' });
    }
    await request(app).post('/api/rent/charges/generate').set(h).send({ period: '2026-03' });
    const auth = { organizationId: t.org.id, userId: null, role: 'ORG_ADMIN', name: 'x' } as unknown as Auth;
    const { cases, omitted } = await gatherCases(auth, new Date('2026-04-20T00:00:00Z'));
    expect(omitted).toBe(0);
    expect(cases.map((c) => [c.propertyTitle, c.owed, c.monthsOverdue, c.history])).toEqual([['Flat B1', 50_000, 1, ['UNPAID']], ['Flat S1', 20_000, 1, ['UNPAID']]]);
  });

  it('is gated by plan, role and AI setup', async () => {
    const starter = await setupTenant('ORG_ADMIN', 'STARTER');
    expect((await request(app).post('/api/ai/rent/collections-plan').set(starter.authHeader)).status).toBe(403);
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post('/api/ai/rent/collections-plan').set({ Authorization: `Bearer ${agent.token}` })).status).toBe(503); // AI check comes first
    const res = await request(app).post('/api/ai/rent/collections-plan').set(t.authHeader);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
});
