import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { truncateAll, setupTenant, createUser } from './helpers';
import { systemDb } from '../db/system';
import { followUps, dripEnrollments } from '../db/schema';
import { eq } from 'drizzle-orm';
import { sweepDripEnrollments } from '../modules/automation/drip.service';

const app = createApp();

describe('automation', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('blocks a STARTER org from rules, sequences and enrollments with an upgrade message', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'STARTER');

    for (const path of ['/api/automation/rules', '/api/automation/sequences', '/api/automation/enrollments']) {
      const res = await request(app).get(path).set(authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
      expect(res.body.error.details.requiredPlan).toBe('GROWTH');
    }
  });

  it('validates auto-assignment rule input (strategy-specific requirements)', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');

    const missingAgent = await request(app)
      .post('/api/automation/rules')
      .set(authHeader)
      .send({ name: 'Website leads', strategy: 'SPECIFIC_AGENT', active: true, priority: 100 });
    expect(missingAgent.status).toBe(422);

    const missingPool = await request(app)
      .post('/api/automation/rules')
      .set(authHeader)
      .send({ name: 'Round robin', strategy: 'ROUND_ROBIN', active: true, priority: 100 });
    expect(missingPool.status).toBe(422);
  });

  it('auto-assigns a new lead to the specific agent a matching rule names', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const agent = await createUser(org.id, { name: 'Dedicated Agent', role: 'AGENT', email: 'dedicated@test.kaya' });

    const ruleRes = await request(app)
      .post('/api/automation/rules')
      .set(authHeader)
      .send({
        name: 'Website leads to Dedicated Agent', active: true, priority: 10,
        sourceFilter: 'WEBSITE', strategy: 'SPECIFIC_AGENT', specificAgentId: agent.id,
      });
    expect(ruleRes.status).toBe(201);

    const leadRes = await request(app)
      .post('/api/leads')
      .set(authHeader)
      .send({ fullName: 'Website Lead', phone: '+254700111222', source: 'WEBSITE' });
    expect(leadRes.status).toBe(201);
    expect(leadRes.body.assignedAgent?.id).toBe(agent.id);

    // A different source shouldn't match — falls back to default (creator).
    const otherLeadRes = await request(app)
      .post('/api/leads')
      .set(authHeader)
      .send({ fullName: 'Referral Lead', phone: '+254700111223', source: 'REFERRAL' });
    expect(otherLeadRes.status).toBe(201);
    expect(otherLeadRes.body.assignedAgent?.id).not.toBe(agent.id);
  });

  it('cycles round-robin assignment across the agent pool in order', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');
    const agent1 = await createUser(org.id, { name: 'Agent One', role: 'AGENT', email: 'rr1@test.kaya' });
    const agent2 = await createUser(org.id, { name: 'Agent Two', role: 'AGENT', email: 'rr2@test.kaya' });

    await request(app)
      .post('/api/automation/rules')
      .set(authHeader)
      .send({
        name: 'Round robin all leads', active: true, priority: 10, sourceFilter: null,
        strategy: 'ROUND_ROBIN', agentPoolIds: [agent1.id, agent2.id],
      });

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/leads')
        .set(authHeader)
        .send({ fullName: `Lead ${i}`, phone: `+25470099900${i}`, source: 'OTHER' });
      ids.push(res.body.assignedAgent.id);
    }
    expect(ids).toEqual([agent1.id, agent2.id, agent1.id]);
  });

  it('creates, lists and deletes a drip sequence with its steps', async () => {
    const { authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');

    const createRes = await request(app)
      .post('/api/automation/sequences')
      .set(authHeader)
      .send({
        name: 'New lead welcome', active: true, sourceFilter: null,
        steps: [
          { offsetHours: 0, title: 'Send welcome message', channel: 'WHATSAPP', priority: 'HIGH' },
          { offsetHours: 48, title: 'Check in after 2 days', channel: 'CALL', priority: 'MEDIUM' },
        ],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.steps).toHaveLength(2);
    expect(createRes.body.steps[0].offsetHours).toBe(0);
    expect(createRes.body.steps[1].offsetHours).toBe(48);

    const listRes = await request(app).get('/api/automation/sequences').set(authHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    const delRes = await request(app).delete(`/api/automation/sequences/${createRes.body.id}`).set(authHeader);
    expect(delRes.status).toBe(204);
    const listAfter = await request(app).get('/api/automation/sequences').set(authHeader);
    expect(listAfter.body).toHaveLength(0);
  });

  it('auto-enrolls a new lead into a matching active sequence, and the sweep materializes due steps as real follow-ups', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');

    const seqRes = await request(app)
      .post('/api/automation/sequences')
      .set(authHeader)
      .send({
        name: 'Website nurture', active: true, sourceFilter: 'WEBSITE',
        steps: [
          { offsetHours: 0, title: 'Immediate welcome', priority: 'HIGH' },
          { offsetHours: 24, title: 'Next-day follow-up', priority: 'MEDIUM' },
        ],
      });
    expect(seqRes.status).toBe(201);

    const leadRes = await request(app)
      .post('/api/leads')
      .set(authHeader)
      .send({ fullName: 'Nurtured Lead', phone: '+254700333444', source: 'WEBSITE' });
    expect(leadRes.status).toBe(201);

    const enrollmentsRes = await request(app).get('/api/automation/enrollments').set(authHeader);
    expect(enrollmentsRes.status).toBe(200);
    expect(enrollmentsRes.body.items).toHaveLength(1);
    expect(enrollmentsRes.body.items[0].status).toBe('ACTIVE');
    expect(enrollmentsRes.body.items[0].stepsTotal).toBe(2);
    expect(enrollmentsRes.body.items[0].stepsDone).toBe(0);

    // Sweep "now" — the offsetHours:0 step is immediately due, the
    // offsetHours:24 step is not yet.
    const firstSweep = await sweepDripEnrollments(new Date());
    expect(firstSweep.stepsCreated).toBe(1);
    expect(firstSweep.completed).toBe(0);

    const [enrollmentRow] = await systemDb.select().from(dripEnrollments).where(eq(dripEnrollments.organizationId, org.id));
    expect(enrollmentRow?.cursorStep).toBe(1);
    expect(enrollmentRow?.status).toBe('ACTIVE');

    const followUpRows = await systemDb.select().from(followUps).where(eq(followUps.organizationId, org.id));
    expect(followUpRows).toHaveLength(1);
    expect(followUpRows[0]?.title).toBe('Immediate welcome');
    expect(followUpRows[0]?.dripEnrollmentId).toBe(enrollmentRow!.id);

    // Sweeping again immediately shouldn't duplicate that first step.
    const secondSweep = await sweepDripEnrollments(new Date());
    expect(secondSweep.stepsCreated).toBe(0);

    // Sweep 25 hours later — the second step is now due, completing the sequence.
    const future = new Date(Date.now() + 25 * 3_600_000);
    const thirdSweep = await sweepDripEnrollments(future);
    expect(thirdSweep.stepsCreated).toBe(1);
    expect(thirdSweep.completed).toBe(1);

    const [completedRow] = await systemDb.select().from(dripEnrollments).where(eq(dripEnrollments.organizationId, org.id));
    expect(completedRow?.status).toBe('COMPLETED');
    expect(completedRow?.cursorStep).toBe(2);
  });

  it('cancels an active enrollment and its still-pending generated follow-ups', async () => {
    const { org, authHeader } = await setupTenant('ORG_ADMIN', 'GROWTH');

    await request(app)
      .post('/api/automation/sequences')
      .set(authHeader)
      .send({
        name: 'Nurture', active: true, sourceFilter: null,
        // Two steps so the enrollment is still ACTIVE (not auto-completed)
        // after the first step fires — otherwise there'd be nothing
        // meaningfully different between "cancel" and "let it finish".
        steps: [
          { offsetHours: 0, title: 'First touch', priority: 'MEDIUM' },
          { offsetHours: 48, title: 'Second touch', priority: 'MEDIUM' },
        ],
      });
    await request(app)
      .post('/api/leads')
      .set(authHeader)
      .send({ fullName: 'Cancel Me', phone: '+254700555666', source: 'OTHER' });

    await sweepDripEnrollments(new Date());

    const [enrollmentRow] = await systemDb.select().from(dripEnrollments).where(eq(dripEnrollments.organizationId, org.id));
    expect(enrollmentRow?.status).toBe('ACTIVE');

    const cancelRes = await request(app).post(`/api/automation/enrollments/${enrollmentRow!.id}/cancel`).set(authHeader);
    expect(cancelRes.status).toBe(204);

    const [cancelledRow] = await systemDb.select().from(dripEnrollments).where(eq(dripEnrollments.id, enrollmentRow!.id));
    expect(cancelledRow?.status).toBe('CANCELLED');

    const followUpRows = await systemDb.select().from(followUps).where(eq(followUps.organizationId, org.id));
    expect(followUpRows[0]?.status).toBe('CANCELLED');
  });
});
