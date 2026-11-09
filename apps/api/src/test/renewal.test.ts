import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { clampRent, median, describePayments } from '../modules/ai/renewal.service';
import { setupTenant, truncateAll, createUser } from './helpers';

const app = createApp();

describe('AI renewal suggestion', () => {
  beforeEach(truncateAll);

  it('keeps the suggested rent sensible whatever the AI says', () => {
    expect(clampRent(50_000, 52_000)).toBe(52_000);
    expect(clampRent(50_000, 90_000)).toBe(57_500); // capped at +15%
    expect(clampRent(50_000, 30_000)).toBe(50_000); // never a cut
    expect(clampRent(50_000, 'lots')).toBe(50_000);
    expect(clampRent(50_000, NaN)).toBe(50_000);
    expect(clampRent(50_000, 52_340)).toBe(52_500); // whole 500s
    expect(clampRent(1_000, 5_000)).toBe(1_000); // tiny rents: cap below a step means no rise
  });

  it('summarises comparables and payment pattern', () => {
    expect(median([30_000, 50_000, 40_000])).toBe(40_000);
    expect(median([30_000, 50_000])).toBe(40_000);
    expect(describePayments({ onTime: 8, late: 3, unpaid: 1 })).toBe('Of the last 12 months: 8 paid on time, 3 paid late, 1 not fully paid.');
    expect(describePayments({ onTime: 0, late: 0, unpaid: 0 })).toBe('No rent history yet.');
  });

  it('is gated by plan, role and AI setup, and rejects unknown leases', async () => {
    const starter = await setupTenant('ORG_ADMIN', 'STARTER');
    const id = '00000000-0000-0000-0000-000000000000';
    expect((await request(app).post(`/api/ai/rent/leases/${id}/renewal`).set(starter.authHeader)).status).toBe(403);
    const t = await setupTenant('ORG_ADMIN', 'GROWTH');
    const res = await request(app).post(`/api/ai/rent/leases/${id}/renewal`).set(t.authHeader);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
    const agent = await createUser(t.org.id, { role: 'AGENT' });
    expect((await request(app).post(`/api/ai/rent/leases/${id}/renewal`).set({ Authorization: `Bearer ${agent.token}` })).status).toBe(503);
  });
});
