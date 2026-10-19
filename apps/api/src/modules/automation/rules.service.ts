import { z } from 'zod';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { LEAD_SOURCES, ASSIGN_STRATEGIES } from '@kaya/shared';
import type { AutomationRule } from '@kaya/shared';
import { withTenant, type Tx } from '../../db/client';
import { automationRules, users } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth, uuidField, nameField } from '../crm/common';

export const ruleInput = z
  .object({
    name: nameField,
    active: z.boolean().default(true),
    priority: z.number().int().min(1).max(1000).default(100),
    sourceFilter: z.enum(LEAD_SOURCES).nullable().optional(),
    strategy: z.enum(ASSIGN_STRATEGIES),
    specificAgentId: uuidField.nullable().optional(),
    agentPoolIds: z.array(uuidField).max(50).optional(),
  })
  .refine((v) => v.strategy !== 'SPECIFIC_AGENT' || Boolean(v.specificAgentId), {
    message: 'Pick an agent for the "specific agent" strategy',
    path: ['specificAgentId'],
  })
  .refine((v) => v.strategy !== 'ROUND_ROBIN' || Boolean(v.agentPoolIds?.length), {
    message: 'Pick at least one agent for the round-robin pool',
    path: ['agentPoolIds'],
  });

async function hydrateRule(tx: Tx, row: typeof automationRules.$inferSelect): Promise<AutomationRule> {
  const poolIds = (row.agentPool as string[]) ?? [];
  const allIds = [...new Set([row.specificAgentId, ...poolIds].filter((id): id is string => Boolean(id)))];
  const agents = allIds.length ? await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, allIds)) : [];
  const byId = new Map(agents.map((a) => [a.id, a.name]));
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    priority: row.priority,
    sourceFilter: row.sourceFilter,
    strategy: row.strategy as AutomationRule['strategy'],
    specificAgent: row.specificAgentId && byId.has(row.specificAgentId) ? { id: row.specificAgentId, name: byId.get(row.specificAgentId)! } : null,
    agentPool: poolIds.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! })),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listRules(a: Auth): Promise<AutomationRule[]> {
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.select().from(automationRules).where(eq(automationRules.organizationId, a.organizationId)).orderBy(asc(automationRules.priority));
    return Promise.all(rows.map((r) => hydrateRule(tx, r)));
  });
}

export async function createRule(a: Auth, body: unknown): Promise<AutomationRule> {
  const input = parse(ruleInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const [row] = await tx
      .insert(automationRules)
      .values({
        organizationId: a.organizationId,
        name: input.name,
        active: input.active,
        priority: input.priority,
        sourceFilter: input.sourceFilter ?? null,
        strategy: input.strategy,
        specificAgentId: input.strategy === 'SPECIFIC_AGENT' ? input.specificAgentId! : null,
        agentPool: input.strategy === 'ROUND_ROBIN' ? input.agentPoolIds! : [],
        createdById: a.userId,
        updatedById: a.userId,
      })
      .returning();
    if (!row) throw notFound('Automation rule');
    return hydrateRule(tx, row);
  });
}

export async function updateRule(a: Auth, id: string, body: unknown): Promise<AutomationRule> {
  parse(uuidField, id);
  const input = parse(ruleInput, body);
  return withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select().from(automationRules).where(and(eq(automationRules.id, id), eq(automationRules.organizationId, a.organizationId)));
    if (!existing) throw notFound('Automation rule');
    await tx
      .update(automationRules)
      .set({
        name: input.name,
        active: input.active,
        priority: input.priority,
        sourceFilter: input.sourceFilter ?? null,
        strategy: input.strategy,
        specificAgentId: input.strategy === 'SPECIFIC_AGENT' ? input.specificAgentId! : null,
        agentPool: input.strategy === 'ROUND_ROBIN' ? input.agentPoolIds! : [],
        updatedById: a.userId,
      })
      .where(eq(automationRules.id, id));
    const [row] = await tx.select().from(automationRules).where(eq(automationRules.id, id));
    return hydrateRule(tx, row!);
  });
}

export async function deleteRule(a: Auth, id: string): Promise<void> {
  parse(uuidField, id);
  await withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select().from(automationRules).where(and(eq(automationRules.id, id), eq(automationRules.organizationId, a.organizationId)));
    if (!existing) throw notFound('Automation rule');
    await tx.delete(automationRules).where(eq(automationRules.id, id));
  });
}

/**
 * Picks an agent for a newly created lead per the org's active automation
 * rules, or null if none match (the caller falls back to its existing
 * default-assignment behavior). Rules are evaluated in priority order
 * (lowest first); the first active rule whose sourceFilter matches the
 * lead's source — or is null, meaning "any source" — wins.
 */
export async function applyAutoAssignRule(tx: Tx, organizationId: string, source: string): Promise<string | null> {
  const rules = await tx
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.organizationId, organizationId), eq(automationRules.active, true)))
    .orderBy(asc(automationRules.priority));

  for (const rule of rules) {
    if (rule.sourceFilter && rule.sourceFilter !== source) continue;

    if (rule.strategy === 'SPECIFIC_AGENT' && rule.specificAgentId) {
      return rule.specificAgentId;
    }

    if (rule.strategy === 'ROUND_ROBIN') {
      const pool = (rule.agentPool as string[]) ?? [];
      if (pool.length === 0) continue;
      const index = rule.roundRobinCursor % pool.length;
      const chosen = pool[index];
      await tx.update(automationRules).set({ roundRobinCursor: (index + 1) % pool.length }).where(eq(automationRules.id, rule.id));
      if (chosen) return chosen;
    }
  }
  return null;
}
