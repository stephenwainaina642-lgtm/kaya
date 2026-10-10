import { eq, and, asc } from 'drizzle-orm';
import { DEAL_STALLED_AFTER_DAYS, DEFAULT_COMMISSION_RATE, effectiveDealValue, calculateCommission } from '@kaya/shared';
import type { DealType } from '@kaya/shared';
import type { Tx } from '../../db/client';
import { dealStages, deals } from '../../db/schema';
import { notFound } from '../../lib/errors';

const DEFAULT_STAGES: { key: string; name: string; position: number; probability: number; isWon: boolean; isLost: boolean }[] = [
  { key: 'NEW', name: 'New', position: 0, probability: 10, isWon: false, isLost: false },
  { key: 'QUALIFYING', name: 'Qualifying', position: 1, probability: 25, isWon: false, isLost: false },
  { key: 'NEGOTIATION', name: 'Negotiation', position: 2, probability: 50, isWon: false, isLost: false },
  { key: 'OFFER', name: 'Offer Made', position: 3, probability: 70, isWon: false, isLost: false },
  { key: 'CLOSING', name: 'Closing', position: 4, probability: 90, isWon: false, isLost: false },
  { key: 'WON', name: 'Won', position: 5, probability: 100, isWon: true, isLost: false },
  { key: 'LOST', name: 'Lost', position: 6, probability: 0, isWon: false, isLost: true },
];

export async function ensureDealStages(tx: Tx, organizationId: string) {
  const existing = await tx.select().from(dealStages).where(eq(dealStages.organizationId, organizationId)).orderBy(asc(dealStages.position));
  if (existing.length > 0) return existing;
  const inserted = await tx
    .insert(dealStages)
    .values(DEFAULT_STAGES.map((s) => ({ organizationId, ...s })))
    .returning();
  return inserted.sort((a, b) => a.position - b.position);
}

export async function requireDeal(tx: Tx, organizationId: string, id: string) {
  const [row] = await tx.select().from(deals).where(and(eq(deals.id, id), eq(deals.organizationId, organizationId)));
  if (!row) throw notFound('Deal');
  return row;
}

export function defaultCommissionRate(dealType: DealType): number {
  return DEFAULT_COMMISSION_RATE[dealType];
}

export function computeCommissionAmount(deal: { finalPrice?: number | null; offerPrice?: number | null; dealValue: number }, ratePercent: number | null): number | null {
  if (ratePercent == null) return null;
  return calculateCommission(effectiveDealValue(deal), ratePercent);
}

export function isStalled(deal: { lastActivityAt: Date; status: string }): boolean {
  if (deal.status !== 'OPEN') return false;
  const ageDays = (Date.now() - deal.lastActivityAt.getTime()) / 86_400_000;
  return ageDays >= DEAL_STALLED_AFTER_DAYS;
}

export async function nextDealNumber(tx: Tx, organizationId: string): Promise<string> {
  const rows = await tx.select({ dealNumber: deals.dealNumber }).from(deals).where(eq(deals.organizationId, organizationId));
  let max = 0;
  for (const r of rows) {
    const n = Number(r.dealNumber.replace(/\D/g, ''));
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `D-${String(max + 1).padStart(4, '0')}`;
}
