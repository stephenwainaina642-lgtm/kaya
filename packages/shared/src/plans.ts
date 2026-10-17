import { PLANS, type Plan } from './enums';

/**
 * Feature-gated modules that differ between plans, per the pricing table on
 * the marketing landing page (apps/web/src/pages/marketing/Landing.tsx).
 * Everything NOT listed here (leads, clients, properties, viewings,
 * follow-ups, tasks, dashboard, communications, documents, owners) is
 * available on every plan — those are the modules every tier's feature
 * list includes starting from Starter.
 */
export const PLAN_MODULES = ['dealsPipeline', 'matching', 'shortlists', 'auditLog'] as const;
export type PlanModule = (typeof PLAN_MODULES)[number];

export interface PlanLimits {
  /** Max active users in the organization. null = unlimited. */
  maxUsers: number | null;
  modules: PlanModule[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  STARTER: {
    maxUsers: 3,
    modules: [],
  },
  GROWTH: {
    maxUsers: null,
    modules: ['dealsPipeline', 'matching', 'shortlists'],
  },
  PRO: {
    maxUsers: null,
    modules: ['dealsPipeline', 'matching', 'shortlists', 'auditLog'],
  },
};

export const PLAN_LABELS: Record<Plan, string> = {
  STARTER: 'Starter',
  GROWTH: 'Growth',
  PRO: 'Pro',
};

export function planHasModule(plan: Plan, module: PlanModule): boolean {
  return PLAN_LIMITS[plan].modules.includes(module);
}

/** The cheapest plan (in PLANS order) that includes this module, for upgrade messaging. */
export function minPlanForModule(module: PlanModule): Plan {
  const found = PLANS.find((plan) => planHasModule(plan, module));
  // Every module here is granted by PRO at minimum, so this always resolves.
  return found ?? 'PRO';
}

export function planUserLimit(plan: Plan): number | null {
  return PLAN_LIMITS[plan].maxUsers;
}
