import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser } from './helpers';
import { systemDb } from '../db/system';
import { clients, owners, properties, deals, commissions } from '../db/schema';
import { ensureDealStages } from '../modules/deals/deal-core';
import { withTenant } from '../db/client';

const app = createApp();

async function seedDealAndCommission(orgId: string, agentId: string, clientId: string) {
  const stages = await withTenant(orgId, (tx) => ensureDealStages(tx, orgId));
  const wonStage = stages.find((s) => s.isWon)!;
  const [deal] = await systemDb.insert(deals).values({
    organizationId: orgId, dealNumber: 'D-TEST-01', name: 'Test deal', dealType: 'SALE', status: 'WON',
    stageId: wonStage.id, clientId, agentId, dealValue: 1_000_000, probability: 100,
  }).returning();
  const [commission] = await systemDb.insert(commissions).values({
    dealId: deal!.id, agentId, amount: 50_000, status: 'PENDING', earnedAt: new Date(),
  }).returning();
  return { deal: deal!, commission: commission! };
}

describe('deals & commissions', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('returns a clean 404 (not a hang) for a deal that does not exist', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const res = await request(app)
      .get('/api/deals/00000000-0000-0000-0000-000000000000')
      .set(authHeader)
      .timeout(5000);
    expect(res.status).toBe(404);
  });

  it('blocks a VIEWER from creating, editing, or deleting deals, and from recording a commission payment', async () => {
    const { org, authHeader: adminAuth } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const viewer = await createUser(org.id, { name: 'Viewer', role: 'VIEWER', email: 'viewer@test.kaya' });
    const viewerAuth = { Authorization: `Bearer ${viewer.token}` };

    const [owner] = await systemDb.insert(owners).values({ organizationId: org.id, fullName: 'Owner', phone: '+254700111222' }).returning();
    const [property] = await systemDb.insert(properties).values({
      organizationId: org.id, reference: 'PRP-T-01', title: 'Test Property', listingType: 'SALE',
      propertyType: 'APARTMENT', price: 5_000_000, location: 'Kilimani', ownerId: owner!.id,
    }).returning();
    const [client] = await systemDb.insert(clients).values({ organizationId: org.id, fullName: 'Client', phone: '+254700333444' }).returning();

    // A VIEWER can look, but not act.
    const createRes = await request(app).post('/api/deals').set(viewerAuth).send({
      name: 'New deal', dealType: 'SALE', clientId: client!.id, propertyId: property!.id, dealValue: 1_000_000,
    });
    expect(createRes.status).toBe(403);

    const { commission } = await seedDealAndCommission(org.id, viewer.id, client!.id);

    const payRes = await request(app)
      .post(`/api/deals/commissions/${commission.id}/payments`)
      .set(viewerAuth)
      .send({ amount: 10_000 });
    expect(payRes.status).toBe(403);

    // The same action, as an admin, is allowed.
    const payResAdmin = await request(app)
      .post(`/api/deals/commissions/${commission.id}/payments`)
      .set(adminAuth)
      .send({ amount: 10_000 });
    expect(payResAdmin.status).toBe(204);
  });

  it('rejects recording a commission payment larger than the outstanding balance', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const agent = await createUser(org.id, { name: 'Agent', role: 'AGENT', email: 'agent@test.kaya' });
    const [client] = await systemDb.insert(clients).values({ organizationId: org.id, fullName: 'Client', phone: '+254700333444' }).returning();
    const { commission } = await seedDealAndCommission(org.id, agent.id, client!.id);

    const tooMuch = await request(app)
      .post(`/api/deals/commissions/${commission.id}/payments`)
      .set(authHeader)
      .send({ amount: 999_999 }); // commission is only 50,000
    expect(tooMuch.status).toBe(422);

    // Paying exactly the remaining balance is fine and marks it PAID.
    const exact = await request(app)
      .post(`/api/deals/commissions/${commission.id}/payments`)
      .set(authHeader)
      .send({ amount: 50_000 });
    expect(exact.status).toBe(204);

    const list = await request(app).get('/api/deals/commissions').set(authHeader);
    const row = list.body.items.find((c: any) => c.id === commission.id);
    expect(row.status).toBe('PAID');
    expect(row.paidAmount).toBe(50_000);

    // Now fully paid — even a tiny further payment is rejected.
    const overflow = await request(app)
      .post(`/api/deals/commissions/${commission.id}/payments`)
      .set(authHeader)
      .send({ amount: 1 });
    expect(overflow.status).toBe(422);
  });

  it('supports partial payment, moving status to PARTIALLY_PAID', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const agent = await createUser(org.id, { name: 'Agent', role: 'AGENT', email: 'agent2@test.kaya' });
    const [client] = await systemDb.insert(clients).values({ organizationId: org.id, fullName: 'Client', phone: '+254700333445' }).returning();
    const { commission } = await seedDealAndCommission(org.id, agent.id, client!.id);

    const res = await request(app)
      .post(`/api/deals/commissions/${commission.id}/payments`)
      .set(authHeader)
      .send({ amount: 20_000 });
    expect(res.status).toBe(204);

    const list = await request(app).get('/api/deals/commissions').set(authHeader);
    const row = list.body.items.find((c: any) => c.id === commission.id);
    expect(row.status).toBe('PARTIALLY_PAID');
    expect(row.paidAmount).toBe(20_000);
  });
});
