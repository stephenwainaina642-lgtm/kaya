import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { OFFER_PARTIES, OFFER_STATUSES } from '@kaya/shared';
import type { DealDetail } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { deals, offers, activities } from '../../db/schema';
import { parse } from '../../lib/validate';
import { type Auth, uuidField } from '../crm/common';
import { requireDeal } from './deal-core';

export const offerCreate = z.object({
  amount: z.number().min(0),
  madeBy: z.enum(OFFER_PARTIES),
  conditions: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const offerStatusInput = z.object({
  status: z.enum(OFFER_STATUSES),
});

async function hydrate(a: Auth, dealId: string): Promise<DealDetail> {
  const { getDeal } = await import('./deals.service');
  return getDeal(a, dealId);
}

export async function addOffer(a: Auth, dealId: string, body: unknown): Promise<DealDetail> {
  parse(uuidField, dealId);
  const input = parse(offerCreate, body);
  await withTenant(a.organizationId, async (tx) => {
    const deal = await requireDeal(tx, a.organizationId, dealId);
    await tx.insert(offers).values({ dealId, amount: input.amount, madeBy: input.madeBy, conditions: input.conditions ?? null, notes: input.notes ?? null });
    await tx.update(deals).set({ offerPrice: input.amount, lastActivityAt: new Date() }).where(eq(deals.id, dealId));
    await tx.insert(activities).values({ organizationId: a.organizationId, type: 'OFFER', title: `Offer of ${input.amount} from ${input.madeBy}`, actorId: a.userId, clientId: deal.clientId, propertyId: deal.propertyId, dealId });
  });
  return hydrate(a, dealId);
}

export async function setOfferStatus(a: Auth, dealId: string, offerId: string, body: unknown): Promise<DealDetail> {
  parse(uuidField, dealId);
  parse(uuidField, offerId);
  const input = parse(offerStatusInput, body);
  await withTenant(a.organizationId, async (tx) => {
    await requireDeal(tx, a.organizationId, dealId);
    await tx.update(offers).set({ status: input.status }).where(eq(offers.id, offerId));
    await tx.update(deals).set({ lastActivityAt: new Date() }).where(eq(deals.id, dealId));
  });
  return hydrate(a, dealId);
}
