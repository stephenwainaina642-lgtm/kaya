import type { Plan } from './enums';

/** Monthly price per agent, in KES. Must match the pricing table on the landing page. */
export const PLAN_PRICE_KES: Record<Plan, number> = { STARTER: 4900, GROWTH: 9900, PRO: 16900 };

export const BILLING_MONTHS = [1, 12] as const;
export type BillingMonths = (typeof BILLING_MONTHS)[number];

/** Annual billing is 10 months for the price of 12. */
export function billableMonths(months: BillingMonths): number {
  return months === 12 ? 10 : months;
}

export function quoteKes(plan: Plan, seats: number, months: BillingMonths): number {
  return PLAN_PRICE_KES[plan] * Math.max(1, seats) * billableMonths(months);
}

/** Days a lapsed paid plan keeps working before dropping to Starter. */
export const GRACE_DAYS = 3;

/** The plan an organisation is entitled to right now. A null expiry never lapses (comped/manual plans). */
export function effectivePlan(plan: Plan, expiresAt: Date | string | null | undefined, now = new Date()): Plan {
  if (plan === 'STARTER' || !expiresAt) return plan;
  const end = new Date(expiresAt).getTime() + GRACE_DAYS * 86_400_000;
  return now.getTime() > end ? 'STARTER' : plan;
}

export type BillingPaymentStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface BillingPayment {
  id: string;
  plan: Plan;
  months: number;
  seats: number;
  amount: number;
  status: BillingPaymentStatus;
  mpesaReceipt: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface BillingOverview {
  plan: Plan;
  /** Plan actually in force (differs from `plan` once a paid period has lapsed). */
  effectivePlan: Plan;
  expiresAt: string | null;
  seats: number;
  /** False until M-Pesa credentials are configured on the server. */
  paymentsEnabled: boolean;
  payments: BillingPayment[];
}

export interface CheckoutInput {
  plan: Plan;
  months: BillingMonths;
  phone: string;
}
