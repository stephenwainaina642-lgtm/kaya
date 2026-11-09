import { and, asc, desc, eq, inArray, lt, ne } from 'drizzle-orm';
import { periodLabel, type CollectionRisk, type CollectionsPlan, type CollectionsPlanItem } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, organizations, properties, rentCharges, rentPayments } from '../../db/schema';
import { askClaudeForJson } from '../../lib/ai';
import type { Auth } from '../crm/common';

const MAX_TENANTS = 12;

export interface CollectionsCase {
  leaseId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyTitle: string;
  rent: number;
  owed: number;
  monthsOverdue: number;
  oldestDaysLate: number;
  /** Last up-to-six months, oldest first: how each was settled. */
  history: ('ON_TIME' | 'LATE' | 'UNPAID')[];
}

/** What the model sees about one tenant: first name and numbers only, never phone, email or ids. */
export function caseToPrompt(c: CollectionsCase, n: number): string {
  return `${n}. ${c.tenantName.split(' ')[0]} | ${c.propertyTitle} | rent ${c.rent} | owes ${c.owed} over ${c.monthsOverdue} month(s) | oldest is ${c.oldestDaysLate} days late | last months: ${c.history.join(', ') || 'none'}`;
}

const RISKS: CollectionRisk[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * Turns the model's JSON into a safe plan. Only tenants we actually sent are
 * kept (the model cannot invent one), text is bounded, and a bad risk label
 * falls back to MEDIUM. Order of our cases is preserved.
 */
export function buildPlan(
  cases: CollectionsCase[],
  raw: { briefing?: unknown; tenants?: { n?: unknown; risk?: unknown; reason?: unknown; action?: unknown; message?: unknown }[] },
  omitted: number,
): CollectionsPlan {
  const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const items: CollectionsPlanItem[] = [];
  const seen = new Set<number>();
  for (const t of raw.tenants ?? []) {
    const n = typeof t.n === 'number' ? t.n : NaN;
    const c = cases[n - 1];
    if (!c || seen.has(n)) continue;
    const message = clip(t.message, 480);
    if (!message) continue;
    seen.add(n);
    items.push({
      leaseId: c.leaseId, tenantName: c.tenantName, tenantPhone: c.tenantPhone, propertyTitle: c.propertyTitle, owed: c.owed, monthsOverdue: c.monthsOverdue,
      risk: RISKS.includes(t.risk as CollectionRisk) ? (t.risk as CollectionRisk) : 'MEDIUM',
      reason: clip(t.reason, 240), action: clip(t.action, 240), message,
    });
  }
  return { briefing: clip(raw.briefing, 600), items, omitted };
}

export async function gatherCases(a: Auth, now = new Date()): Promise<{ cases: CollectionsCase[]; omitted: number }> {
  const today = now.toISOString().slice(0, 10);
  return withTenant(a.organizationId, async (tx) => {
    const overdue = await tx.select({
      leaseId: leases.id, rent: leases.rentAmount, tenantName: clients.fullName, tenantPhone: clients.phone, propertyTitle: properties.title,
      dueDate: rentCharges.dueDate, amount: rentCharges.amount, paid: rentCharges.paidAmount,
    })
      .from(rentCharges)
      .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .innerJoin(clients, eq(clients.id, leases.tenantId))
      .where(and(ne(rentCharges.status, 'PAID'), lt(rentCharges.dueDate, today), eq(leases.status, 'ACTIVE')))
      .orderBy(asc(rentCharges.dueDate));

    const byLease = new Map<string, CollectionsCase>();
    for (const r of overdue) {
      const days = Math.floor((Date.parse(today) - Date.parse(r.dueDate)) / 86_400_000);
      const c = byLease.get(r.leaseId) ?? {
        leaseId: r.leaseId, tenantName: r.tenantName, tenantPhone: r.tenantPhone ?? null, propertyTitle: r.propertyTitle, rent: r.rent,
        owed: 0, monthsOverdue: 0, oldestDaysLate: days, history: [],
      };
      c.owed += r.amount - r.paid;
      c.monthsOverdue++;
      byLease.set(r.leaseId, c);
    }
    const all = [...byLease.values()].sort((x, y) => y.owed - x.owed);
    const cases = all.slice(0, MAX_TENANTS);
    if (cases.length) {
      const ids = cases.map((c) => c.leaseId);
      const charges = await tx.select().from(rentCharges).where(inArray(rentCharges.leaseId, ids)).orderBy(desc(rentCharges.period));
      const pays = charges.length ? await tx.select().from(rentPayments).where(inArray(rentPayments.chargeId, charges.map((c) => c.id))) : [];
      const lastPaid = new Map<string, number>();
      for (const p of pays) lastPaid.set(p.chargeId, Math.max(lastPaid.get(p.chargeId) ?? 0, p.paidAt.getTime()));
      for (const c of cases) {
        const mine = charges.filter((x) => x.leaseId === c.leaseId && x.dueDate <= today).slice(0, 6).reverse();
        c.history = mine.map((x) => {
          if (x.paidAmount < x.amount) return 'UNPAID' as const;
          return (lastPaid.get(x.id) ?? 0) <= Date.parse(x.dueDate) + 4 * 86_400_000 ? 'ON_TIME' as const : 'LATE' as const;
        });
      }
    }
    return { cases, omitted: all.length - cases.length };
  });
}

/**
 * An AI collections plan: ranks overdue tenants by how likely rent is to be
 * recovered and drafts a respectful message for each. It suggests; a person
 * sends. Only first names, amounts and payment pattern leave the server.
 */
export async function collectionsPlan(a: Auth): Promise<CollectionsPlan> {
  const { cases, omitted } = await gatherCases(a);
  if (cases.length === 0) return { briefing: 'No rent is overdue right now. Nothing to chase.', items: [], omitted: 0 };
  const [org] = await systemDb.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, a.organizationId));
  const raw = await askClaudeForJson<Parameters<typeof buildPlan>[1]>(
    `You help a Kenyan property management agency (${org?.name ?? 'the agency'}) collect overdue rent firmly but respectfully. ` +
      'Amounts are Kenyan shillings (KES). For each numbered tenant, judge the risk the rent will not be recovered (LOW = usually pays, just late; ' +
      'MEDIUM = pattern of delays; HIGH = repeatedly unpaid or very old arrears), give a one-sentence reason from the data given, ' +
      'a concrete next step for the agent (e.g. phone call, payment plan, formal notice), and a ready-to-send WhatsApp/SMS message of at most 3 sentences ' +
      'that names the amount owed, is polite, never threatens, and asks for a payment date. Write the message in simple English, with a short Swahili greeting such as "Habari". ' +
      'Use only the data supplied; do not invent facts, legal claims or deadlines. ' +
      'Return JSON: {"briefing": "<2-3 sentences on the overall picture>", "tenants": [{"n": <number from the list>, "risk": "LOW|MEDIUM|HIGH", "reason": "...", "action": "...", "message": "..."}]}.',
    cases.map((c, i) => caseToPrompt(c, i + 1)).join('\n'),
    2200,
  );
  return buildPlan(cases, raw, omitted);
}
