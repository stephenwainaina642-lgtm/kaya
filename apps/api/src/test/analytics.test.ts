import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser } from './helpers';
import { systemDb } from '../db/system';
import { leads, clients, viewings, deals, commissions, owners, properties } from '../db/schema';
import { ensureDealStages } from '../modules/deals/deal-core';
import { withTenant } from '../db/client';

const app = createApp();

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('analytics', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('is blocked on a GROWTH org (analytics is Pro-only)', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const res = await request(app).get('/api/analytics').set(authHeader);
    expect(res.status).toBe(403);
    expect(res.body.error.details.requiredPlan).toBe('PRO');
  });

  it('computes the funnel, leaderboard, forecast and source ROI from real deal data', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'PRO');
    const agent1 = await createUser(org.id, { name: 'Agent One', role: 'AGENT', email: 'agent1@test.kaya' });
    const agent2 = await createUser(org.id, { name: 'Agent Two', role: 'AGENT', email: 'agent2@test.kaya' });

    const [lead1] = await systemDb.insert(leads).values({
      organizationId: org.id, fullName: 'Lead One', phone: '+254700000001', source: 'WEBSITE',
    }).returning();
    const [lead2] = await systemDb.insert(leads).values({
      organizationId: org.id, fullName: 'Lead Two', phone: '+254700000002', source: 'REFERRAL',
    }).returning();
    await systemDb.insert(leads).values({
      organizationId: org.id, fullName: 'Lead Three', phone: '+254700000003', source: 'WEBSITE',
    });

    const [client1] = await systemDb.insert(clients).values({
      organizationId: org.id, fullName: 'Lead One', phone: '+254700000001', leadId: lead1!.id,
    }).returning();
    const [client2] = await systemDb.insert(clients).values({
      organizationId: org.id, fullName: 'Lead Two', phone: '+254700000002', leadId: lead2!.id,
    }).returning();

    const [owner] = await systemDb.insert(owners).values({ organizationId: org.id, fullName: 'Test Owner', phone: '+254700999000' }).returning();
    const [property] = await systemDb.insert(properties).values({
      organizationId: org.id, reference: 'PRP-TEST-001', title: 'Test Property', listingType: 'SALE',
      propertyType: 'APARTMENT', price: 10_000_000, location: 'Kilimani', ownerId: owner!.id,
    }).returning();
    await systemDb.insert(viewings).values({
      organizationId: org.id, propertyId: property!.id, leadId: lead1!.id, agentId: agent1.id,
      scheduledAt: new Date(), status: 'COMPLETED',
    });

    const stages = await withTenant(org.id, (tx) => ensureDealStages(tx, org.id));
    const wonStage = stages.find((s) => s.isWon)!;
    const openStage = stages.find((s) => s.key === 'NEGOTIATION')!;

    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 15);

    const [dealWon] = await systemDb.insert(deals).values({
      organizationId: org.id, dealNumber: 'D-0001', name: 'Won deal', dealType: 'SALE', status: 'WON',
      stageId: wonStage.id, clientId: client1!.id, leadId: lead1!.id, agentId: agent1.id,
      dealValue: 1_000_000, probability: 100, actualCloseDate: ymd(today),
    }).returning();
    await systemDb.insert(deals).values({
      organizationId: org.id, dealNumber: 'D-0002', name: 'Lost deal', dealType: 'SALE', status: 'LOST',
      stageId: stages.find((s) => s.isLost)!.id, clientId: client2!.id, leadId: lead2!.id, agentId: agent1.id,
      dealValue: 500_000, probability: 0,
    });
    await systemDb.insert(deals).values({
      organizationId: org.id, dealNumber: 'D-0003', name: 'Open deal', dealType: 'SALE', status: 'OPEN',
      stageId: openStage.id, clientId: client1!.id, leadId: null, agentId: agent2.id,
      dealValue: 2_000_000, probability: 50, expectedCloseDate: ymd(nextMonth),
    });

    await systemDb.insert(commissions).values({
      dealId: dealWon!.id, agentId: agent1.id, amount: 50_000, status: 'PAID', earnedAt: new Date(),
    });

    const res = await request(app).get('/api/analytics').set(authHeader);
    expect(res.status).toBe(200);
    const data = res.body;

    expect(data.funnel).toEqual([
      { key: 'LEADS', label: 'Leads', count: 3 },
      { key: 'VIEWED', label: 'Had a viewing', count: 1 },
      { key: 'DEAL_CREATED', label: 'Became a deal', count: 2 }, // lead1 + lead2 (lead3 and the open deal's null lead don't count)
      { key: 'WON', label: 'Won', count: 1 },
    ]);

    const agent1Row = data.leaderboard.find((r: any) => r.agent.id === agent1.id);
    expect(agent1Row.dealsWon).toBe(1);
    expect(agent1Row.dealsLost).toBe(1);
    expect(agent1Row.winRate).toBeCloseTo(0.5);
    expect(agent1Row.commissionEarned).toBe(50_000);
    const agent2Row = data.leaderboard.find((r: any) => r.agent.id === agent2.id);
    expect(agent2Row.dealsWon).toBe(0);
    expect(agent2Row.commissionEarned).toBe(0);
    expect(data.leaderboard[0].rank).toBe(1);

    expect(data.forecast).toHaveLength(1);
    expect(data.forecast[0].dealCount).toBe(1);
    expect(data.forecast[0].rawValue).toBe(2_000_000);
    expect(data.forecast[0].weightedValue).toBe(1_000_000);

    const websiteRow = data.sourceRoi.find((r: any) => r.source === 'WEBSITE');
    expect(websiteRow.totalLeads).toBe(2);
    expect(websiteRow.dealsWon).toBe(1);
    expect(websiteRow.conversionRate).toBeCloseTo(0.5);
    expect(websiteRow.commissionEarned).toBe(50_000);

    const referralRow = data.sourceRoi.find((r: any) => r.source === 'REFERRAL');
    expect(referralRow.totalLeads).toBe(1);
    expect(referralRow.dealsWon).toBe(0);
  });
});
