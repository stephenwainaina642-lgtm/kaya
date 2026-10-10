import { z } from 'zod';
import { and, eq, asc, desc } from 'drizzle-orm';
import { DEAL_TYPES } from '@kaya/shared';
import type { DealBoard, BoardStage, DealCard, DealDetail, DealOffer, DealCommissionItem } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { deals, dealStages, clients, properties, owners, users, offers, commissions, activities } from '../../db/schema';
import { notFound, invalid } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, textField, agentRef } from '../crm/common';
import { recordAudit } from '../../lib/audit';
import { ensureDealStages, requireDeal, defaultCommissionRate, computeCommissionAmount, isStalled, nextDealNumber } from './deal-core';

export const dealCreate = z.object({
  name: textField(200),
  dealType: z.enum(DEAL_TYPES),
  clientId: uuidField,
  propertyId: uuidField.nullable().optional(),
  leadId: uuidField.nullable().optional(),
  ownerId: uuidField.nullable().optional(),
  agentId: uuidField.nullable().optional(),
  dealValue: z.number().min(0),
  commissionRate: z.number().min(0).max(100).nullable().optional(),
  offerPrice: z.number().min(0).nullable().optional(),
  expectedCloseDate: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const dealUpdate = z.object({
  name: textField(200).optional(),
  propertyId: uuidField.nullable().optional(),
  dealValue: z.number().min(0).optional(),
  commissionRate: z.number().min(0).max(100).nullable().optional(),
  offerPrice: z.number().min(0).nullable().optional(),
  finalPrice: z.number().min(0).nullable().optional(),
  expectedCloseDate: z.string().trim().max(40).nullable().optional(),
  actualCloseDate: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID']).optional(),
});

export const moveStageInput = z.object({
  stageId: uuidField,
  lostReason: z.string().trim().max(500).nullable().optional(),
});

async function toCard(tx: Tx, row: typeof deals.$inferSelect): Promise<DealCard> {
  const [client] = await tx.select({ name: clients.fullName }).from(clients).where(eq(clients.id, row.clientId));
  const [prop] = row.propertyId ? await tx.select({ title: properties.title }).from(properties).where(eq(properties.id, row.propertyId)) : [null];
  const [agent] = await tx.select({ name: users.name }).from(users).where(eq(users.id, row.agentId));
  return {
    id: row.id,
    dealNumber: row.dealNumber,
    name: row.name,
    dealType: row.dealType,
    status: row.status,
    stageId: row.stageId,
    clientName: client?.name ?? 'Unknown',
    propertyTitle: prop?.title ?? null,
    agent: agentRef(row.agentId, agent?.name ?? null)!,
    value: row.finalPrice ?? row.offerPrice ?? row.dealValue,
    commissionAmount: row.commissionAmount,
    stageEnteredAt: row.stageEnteredAt.toISOString(),
    isStalled: isStalled(row),
  };
}

export async function getBoard(a: Auth): Promise<DealBoard> {
  return withTenant(a.organizationId, async (tx) => {
    const stages = await ensureDealStages(tx, a.organizationId);
    const allDeals = await tx.select().from(deals).where(and(eq(deals.organizationId, a.organizationId), eq(deals.status, 'OPEN'))).orderBy(desc(deals.createdAt));

    const cards = await Promise.all(allDeals.map((d) => toCard(tx, d)));
    const byStage = new Map<string, DealCard[]>();
    for (const c of cards) {
      const list = byStage.get(c.stageId) ?? [];
      list.push(c);
      byStage.set(c.stageId, list);
    }

    const boardStages: BoardStage[] = stages
      .filter((s) => !s.isWon && !s.isLost)
      .map((s) => {
        const sDeals = byStage.get(s.id) ?? [];
        return {
          id: s.id,
          key: s.key,
          name: s.name,
          position: s.position,
          probability: s.probability,
          isWon: s.isWon,
          isLost: s.isLost,
          deals: sDeals,
          totalValue: sDeals.reduce((sum, d) => sum + d.value, 0),
        };
      });

    return { stages: boardStages };
  });
}

async function hydrateDetail(tx: Tx, organizationId: string, id: string): Promise<DealDetail> {
  const row = await requireDeal(tx, organizationId, id);
  const [stage] = await tx.select().from(dealStages).where(eq(dealStages.id, row.stageId));
  const [client] = await tx.select({ id: clients.id, name: clients.fullName }).from(clients).where(eq(clients.id, row.clientId));
  const [prop] = row.propertyId ? await tx.select({ id: properties.id, title: properties.title }).from(properties).where(eq(properties.id, row.propertyId)) : [null];
  const [owner] = row.ownerId ? await tx.select({ id: owners.id, name: owners.fullName, company: owners.companyName }).from(owners).where(eq(owners.id, row.ownerId)) : [null];
  const [agent] = await tx.select({ name: users.name }).from(users).where(eq(users.id, row.agentId));

  const offerRows = await tx.select().from(offers).where(eq(offers.dealId, id)).orderBy(desc(offers.offeredAt));
  const dealOffers: DealOffer[] = offerRows.map((o) => ({ id: o.id, amount: o.amount, madeBy: o.madeBy, status: o.status, conditions: o.conditions, notes: o.notes, offeredAt: o.offeredAt.toISOString() }));

  const commissionRows = await tx.select().from(commissions).where(eq(commissions.dealId, id));
  const commissionAgentIds = [...new Set(commissionRows.map((c) => c.agentId))];
  const agentNameMap = new Map<string, string>();
  for (const aid of commissionAgentIds) {
    const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, aid));
    if (u) agentNameMap.set(aid, u.name);
  }
  const dealCommissions: DealCommissionItem[] = commissionRows.map((c) => ({
    id: c.id,
    agent: agentRef(c.agentId, agentNameMap.get(c.agentId) ?? null)!,
    sharePercent: c.sharePercent,
    amount: c.amount,
    paidAmount: c.paidAmount,
    status: c.status,
    earnedAt: c.earnedAt?.toISOString() ?? null,
    paidAt: c.paidAt?.toISOString() ?? null,
  }));

  return {
    id: row.id,
    dealNumber: row.dealNumber,
    name: row.name,
    dealType: row.dealType,
    status: row.status,
    stage: stage
      ? { id: stage.id, key: stage.key, name: stage.name, position: stage.position, probability: stage.probability, isWon: stage.isWon, isLost: stage.isLost }
      : { id: row.stageId, key: '', name: 'Unknown', position: 0, probability: 0, isWon: false, isLost: false },
    client: { id: client?.id ?? row.clientId, name: client?.name ?? 'Unknown' },
    property: prop ? { id: prop.id, title: prop.title } : null,
    owner: owner ? { id: owner.id, name: owner.name ?? owner.company ?? 'Unknown' } : null,
    agent: agentRef(row.agentId, agent?.name ?? null)!,
    dealValue: row.dealValue,
    commissionRate: row.commissionRate,
    commissionAmount: row.commissionAmount,
    probability: row.probability,
    offerPrice: row.offerPrice,
    finalPrice: row.finalPrice,
    expectedCloseDate: row.expectedCloseDate,
    actualCloseDate: row.actualCloseDate,
    lostReason: row.lostReason,
    notes: row.notes,
    paymentStatus: row.paymentStatus,
    offers: dealOffers,
    commissions: dealCommissions,
    stageEnteredAt: row.stageEnteredAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
  };
}

export async function getDeal(a: Auth, id: string): Promise<DealDetail> {
  parse(uuidField, id);
  return withTenant(a.organizationId, (tx) => hydrateDetail(tx, a.organizationId, id));
}

export async function createDeal(a: Auth, body: unknown): Promise<DealDetail> {
  const input = parse(dealCreate, body);
  return withTenant(a.organizationId, async (tx) => {
    const stages = await ensureDealStages(tx, a.organizationId);
    const firstStage = stages.find((s) => !s.isWon && !s.isLost) ?? stages[0]!;
    const dealNumber = await nextDealNumber(tx, a.organizationId);
    const agentId = input.agentId ?? a.userId;
    const commissionRate = input.commissionRate ?? defaultCommissionRate(input.dealType);
    const commissionAmount = computeCommissionAmount({ dealValue: input.dealValue, offerPrice: input.offerPrice ?? null, finalPrice: null }, commissionRate);

    const [row] = await tx
      .insert(deals)
      .values({
        organizationId: a.organizationId,
        dealNumber,
        name: input.name,
        dealType: input.dealType,
        stageId: firstStage.id,
        clientId: input.clientId,
        propertyId: input.propertyId ?? null,
        leadId: input.leadId ?? null,
        ownerId: input.ownerId ?? null,
        agentId,
        dealValue: input.dealValue,
        commissionRate,
        commissionAmount,
        probability: firstStage.probability,
        offerPrice: input.offerPrice ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        notes: input.notes ?? null,
        createdById: a.userId,
        updatedById: a.userId,
      })
      .returning({ id: deals.id });
    if (!row) throw notFound('Deal');

    await tx.insert(activities).values({ organizationId: a.organizationId, type: 'DEAL', title: `Deal "${input.name}" created`, actorId: a.userId, clientId: input.clientId, propertyId: input.propertyId ?? null, dealId: row.id });

    return hydrateDetail(tx, a.organizationId, row.id);
  });
}

export async function updateDeal(a: Auth, id: string, body: unknown): Promise<DealDetail> {
  parse(uuidField, id);
  const input = parse(dealUpdate, body);
  return withTenant(a.organizationId, async (tx) => {
    const existing = await requireDeal(tx, a.organizationId, id);
    const nextDealValue = input.dealValue ?? existing.dealValue;
    const nextOfferPrice = input.offerPrice !== undefined ? input.offerPrice : existing.offerPrice;
    const nextFinalPrice = input.finalPrice !== undefined ? input.finalPrice : existing.finalPrice;
    const nextRate = input.commissionRate !== undefined ? input.commissionRate : existing.commissionRate;
    const commissionAmount = computeCommissionAmount({ dealValue: nextDealValue, offerPrice: nextOfferPrice, finalPrice: nextFinalPrice }, nextRate);

    await tx
      .update(deals)
      .set({
        name: input.name ?? existing.name,
        propertyId: input.propertyId !== undefined ? input.propertyId : existing.propertyId,
        dealValue: nextDealValue,
        commissionRate: nextRate,
        commissionAmount,
        offerPrice: nextOfferPrice,
        finalPrice: nextFinalPrice,
        expectedCloseDate: input.expectedCloseDate !== undefined ? input.expectedCloseDate : existing.expectedCloseDate,
        actualCloseDate: input.actualCloseDate !== undefined ? input.actualCloseDate : existing.actualCloseDate,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        paymentStatus: input.paymentStatus ?? existing.paymentStatus,
        lastActivityAt: new Date(),
        updatedById: a.userId,
      })
      .where(eq(deals.id, id));

    return hydrateDetail(tx, a.organizationId, id);
  });
}

export async function moveDealStage(a: Auth, id: string, body: unknown): Promise<DealDetail> {
  parse(uuidField, id);
  const input = parse(moveStageInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const existing = await requireDeal(tx, a.organizationId, id);
    const [stage] = await tx.select().from(dealStages).where(and(eq(dealStages.id, input.stageId), eq(dealStages.organizationId, a.organizationId)));
    if (!stage) throw notFound('Deal stage');
    if (stage.isLost && !input.lostReason) throw invalid({ lostReason: 'Required when moving to a lost stage' });

    const status = stage.isWon ? 'WON' : stage.isLost ? 'LOST' : 'OPEN';
    const commissionAmount = computeCommissionAmount(existing, existing.commissionRate);

    await tx
      .update(deals)
      .set({
        stageId: stage.id,
        status,
        probability: stage.probability,
        lostReason: stage.isLost ? input.lostReason : existing.lostReason,
        actualCloseDate: stage.isWon || stage.isLost ? new Date().toISOString().slice(0, 10) : existing.actualCloseDate,
        commissionAmount,
        stageEnteredAt: new Date(),
        lastActivityAt: new Date(),
        updatedById: a.userId,
      })
      .where(eq(deals.id, id));

    if (stage.isWon) {
      const [existingCommission] = await tx.select({ id: commissions.id }).from(commissions).where(eq(commissions.dealId, id));
      if (!existingCommission && commissionAmount != null) {
        await tx.insert(commissions).values({ dealId: id, agentId: existing.agentId, sharePercent: 100, amount: commissionAmount, status: 'PENDING', earnedAt: new Date() });
      }
    }

    await tx.insert(activities).values({ organizationId: a.organizationId, type: 'DEAL', title: `Deal moved to "${stage.name}"`, actorId: a.userId, clientId: existing.clientId, propertyId: existing.propertyId, dealId: id });
    await recordAudit(tx, { organizationId: a.organizationId, actorId: a.userId, action: 'STAGE_CHANGE', entityType: 'deal', entityId: id, summary: `Moved to ${stage.name}` });

    return hydrateDetail(tx, a.organizationId, id);
  });
}

export async function deleteDeal(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    await requireDeal(tx, a.organizationId, id);
    await tx.delete(deals).where(eq(deals.id, id));
  });
}
