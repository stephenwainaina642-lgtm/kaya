import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { INTENTS, SEGMENTS, FURNISHINGS, PROPERTY_TYPES } from '@kaya/shared';
import type { Tx } from '../../db/client';
import { requirements } from '../../db/schema';

export const requirementsInput = z
  .object({
    intent: z.enum(INTENTS).nullable().default(null),
    segment: z.enum(SEGMENTS).nullable().default(null),
    budgetMin: z.number().min(0).nullable().default(null),
    budgetMax: z.number().min(0).nullable().default(null),
    locations: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    propertyTypes: z.array(z.enum(PROPERTY_TYPES)).max(20).default([]),
    bedroomsMin: z.number().int().min(0).nullable().default(null),
    bathroomsMin: z.number().int().min(0).nullable().default(null),
    parkingMin: z.number().int().min(0).nullable().default(null),
    furnishing: z.enum(FURNISHINGS).nullable().default(null),
    amenities: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    moveBy: z.string().trim().max(40).nullable().default(null),
    timeline: z.string().trim().max(200).nullable().default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((v) => v.budgetMin == null || v.budgetMax == null || v.budgetMax >= v.budgetMin, {
    message: 'budgetMax must be greater than or equal to budgetMin',
    path: ['budgetMax'],
  });

export type RequirementsInput = z.infer<typeof requirementsInput>;

export function mapRequirements(row: typeof requirements.$inferSelect | undefined) {
  if (!row) return null;
  return {
    intent: row.intent,
    segment: row.segment,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    locations: row.locations,
    propertyTypes: row.propertyTypes,
    bedroomsMin: row.bedroomsMin,
    bathroomsMin: row.bathroomsMin,
    parkingMin: row.parkingMin,
    furnishing: row.furnishing,
    amenities: row.amenities,
    moveBy: row.moveBy,
    timeline: row.timeline,
    notes: row.notes,
  };
}

export async function getRequirements(tx: Tx, ref: { leadId?: string | null; clientId?: string | null }) {
  const where = ref.leadId ? eq(requirements.leadId, ref.leadId) : eq(requirements.clientId, ref.clientId!);
  const [row] = await tx.select().from(requirements).where(where);
  return mapRequirements(row);
}

export async function saveRequirements(
  tx: Tx,
  organizationId: string,
  ref: { leadId?: string | null; clientId?: string | null },
  input: RequirementsInput,
) {
  const where = ref.leadId ? eq(requirements.leadId, ref.leadId) : eq(requirements.clientId, ref.clientId!);
  const [existing] = await tx.select({ id: requirements.id }).from(requirements).where(where);
  if (existing) {
    await tx.update(requirements).set(input).where(eq(requirements.id, existing.id));
  } else {
    await tx.insert(requirements).values({ organizationId, leadId: ref.leadId ?? null, clientId: ref.clientId ?? null, ...input });
  }
}

export async function moveRequirementsToClient(tx: Tx, leadId: string, clientId: string): Promise<void> {
  await tx.update(requirements).set({ leadId: null, clientId }).where(eq(requirements.leadId, leadId));
}
