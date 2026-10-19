import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { TEMPERATURES } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { leads, clients, requirements, activities, communications, followUps, users } from '../../db/schema';
import { askClaude, askClaudeForJson } from '../../lib/ai';
import { notFound, invalid } from '../../lib/errors';
import { type Auth } from '../crm/common';
import { getDashboard } from '../dashboard/dashboard.service';

type ContactType = 'lead' | 'client';

async function gatherContext(tx: Parameters<Parameters<typeof withTenant>[1]>[0], contactType: ContactType, contactId: string) {
  if (contactType === 'lead') {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, contactId));
    if (!lead) throw notFound('Lead');
    const [req] = await tx.select().from(requirements).where(eq(requirements.leadId, contactId));
    const recentActivities = await tx.select().from(activities).where(eq(activities.leadId, contactId)).orderBy(desc(activities.occurredAt)).limit(8);
    const recentComms = await tx.select().from(communications).where(eq(communications.leadId, contactId)).orderBy(desc(communications.occurredAt)).limit(8);
    return {
      name: lead.fullName,
      kind: 'lead' as const,
      status: lead.status,
      source: lead.source,
      temperature: lead.temperature,
      daysSinceCreated: Math.floor((Date.now() - lead.createdAt.getTime()) / 86_400_000),
      notes: lead.notes,
      requirements: req ?? null,
      recentActivities,
      recentComms,
    };
  }
  const [client] = await tx.select().from(clients).where(eq(clients.id, contactId));
  if (!client) throw notFound('Client');
  const [req] = await tx.select().from(requirements).where(eq(requirements.clientId, contactId));
  const recentActivities = await tx.select().from(activities).where(eq(activities.clientId, contactId)).orderBy(desc(activities.occurredAt)).limit(8);
  const recentComms = await tx.select().from(communications).where(eq(communications.clientId, contactId)).orderBy(desc(communications.occurredAt)).limit(8);
  return {
    name: client.fullName,
    kind: 'client' as const,
    status: client.status,
    source: null,
    temperature: null,
    daysSinceCreated: Math.floor((Date.now() - client.createdAt.getTime()) / 86_400_000),
    notes: client.notes,
    requirements: req ?? null,
    recentActivities,
    recentComms,
  };
}

function contextToText(ctx: Awaited<ReturnType<typeof gatherContext>>): string {
  const lines: string[] = [];
  lines.push(`Contact: ${ctx.name} (${ctx.kind}, status ${ctx.status}${ctx.source ? `, source ${ctx.source}` : ''})`);
  lines.push(`In the system for ${ctx.daysSinceCreated} day(s).`);
  if (ctx.temperature) lines.push(`Current temperature label: ${ctx.temperature}`);
  if (ctx.notes) lines.push(`Notes: ${ctx.notes}`);
  if (ctx.requirements) {
    const r = ctx.requirements;
    lines.push(
      `Requirements: intent=${r.intent ?? 'n/a'}, segment=${r.segment ?? 'n/a'}, budget=${r.budgetMin ?? '?'}-${r.budgetMax ?? '?'} KES, locations=${r.locations.join(', ') || 'n/a'}, propertyTypes=${r.propertyTypes.join(', ') || 'n/a'}`,
    );
  }
  if (ctx.recentActivities.length > 0) {
    lines.push('Recent activity (newest first):');
    for (const a of ctx.recentActivities) lines.push(`- [${a.occurredAt.toISOString().slice(0, 10)}] ${a.type}: ${a.title}${a.body ? ` — ${a.body}` : ''}`);
  }
  if (ctx.recentComms.length > 0) {
    lines.push('Recent communications (newest first):');
    for (const c of ctx.recentComms) lines.push(`- [${c.occurredAt.toISOString().slice(0, 10)}] ${c.direction} ${c.channel}${c.subject ? `: ${c.subject}` : ''}${c.body ? ` — ${c.body}` : ''}`);
  }
  if (ctx.recentActivities.length === 0 && ctx.recentComms.length === 0) {
    lines.push('No activity or communication history recorded yet.');
  }
  return lines.join('\n');
}

export interface LeadScoreResult {
  temperature: 'HOT' | 'WARM' | 'COLD';
  reasoning: string;
}

export async function scoreLead(a: Auth, leadId: string): Promise<LeadScoreResult> {
  return withTenant(a.organizationId, async (tx) => {
    const ctx = await gatherContext(tx, 'lead', leadId);
    const result = await askClaudeForJson<{ temperature: string; reasoning: string }>(
      'You are a real estate CRM assistant scoring how promising a sales lead is. ' +
        'Classify them as HOT (actively engaged, clear budget/timeline, recent positive contact), ' +
        'WARM (some engagement but not urgent or incomplete info), or COLD (little/no response, stale, or vague requirements). ' +
        'Return JSON: {"temperature": "HOT"|"WARM"|"COLD", "reasoning": "<one or two sentences explaining why, citing specifics from the data given>"}.',
      contextToText(ctx),
      400,
    );
    if (!TEMPERATURES.includes(result.temperature as (typeof TEMPERATURES)[number])) {
      throw invalid({ temperature: 'AI returned an unrecognized temperature' });
    }
    return { temperature: result.temperature as LeadScoreResult['temperature'], reasoning: result.reasoning };
  });
}

export const draftMessageInput = z.object({
  contactType: z.enum(['lead', 'client']),
  contactId: z.string().uuid(),
  channel: z.enum(['whatsapp', 'email']),
  goal: z.string().trim().max(300).optional(),
});

export interface DraftMessageResult {
  subject: string | null;
  body: string;
}

export async function draftMessage(a: Auth, input: z.infer<typeof draftMessageInput>): Promise<DraftMessageResult> {
  return withTenant(a.organizationId, async (tx) => {
    const ctx = await gatherContext(tx, input.contactType, input.contactId);
    const [agent] = await tx.select({ name: users.name }).from(users).where(eq(users.id, a.userId));

    const channelGuidance =
      input.channel === 'whatsapp'
        ? 'Write a short WhatsApp message (2-4 sentences, warm and conversational, no subject line). Sign off with just the agent\'s first name.'
        : 'Write a short professional email (3-6 sentences). Include a short, specific subject line as the first line, formatted exactly as "SUBJECT: <text>", followed by a blank line, then the email body signed off with the agent\'s full name.';

    const raw = await askClaude(
      `You are drafting a message on behalf of a Kenyan real estate agent to a ${ctx.kind} named ${ctx.name}, using the agent's name "${agent?.name ?? 'the agent'}". ` +
        `${channelGuidance} Use the contact's real situation below — do not invent property details, prices, or facts not given. ` +
        (input.goal ? `The agent's specific goal for this message: ${input.goal}. ` : '') +
        'Keep it natural and not overly salesy. This is a DRAFT the agent will review and edit before sending.',
      contextToText(ctx),
      500,
    );

    if (input.channel === 'email' && raw.startsWith('SUBJECT:')) {
      const [subjectLine, ...rest] = raw.split('\n');
      return { subject: subjectLine!.replace(/^SUBJECT:\s*/, '').trim(), body: rest.join('\n').trim() };
    }
    return { subject: null, body: raw };
  });
}

export const summarizeInput = z.object({
  contactType: z.enum(['lead', 'client']),
  contactId: z.string().uuid(),
});

export async function summarizeContact(a: Auth, input: z.infer<typeof summarizeInput>): Promise<{ summary: string }> {
  return withTenant(a.organizationId, async (tx) => {
    const ctx = await gatherContext(tx, input.contactType, input.contactId);
    const summary = await askClaude(
      'You are a real estate CRM assistant. Summarize this contact\'s situation for a busy agent in 2-4 sentences: ' +
        'where things stand, what has happened recently, and one concrete suggested next step. Be specific and concise — no filler.',
      contextToText(ctx),
      350,
    );
    return { summary };
  });
}

export interface NextAction {
  title: string;
  reasoning: string;
  link: string;
}

export async function nextBestActions(a: Auth): Promise<{ actions: NextAction[] }> {
  const dashboard = await getDashboard(a);
  const top = dashboard.attention.slice(0, 6);
  if (top.length === 0) return { actions: [] };

  const list = top.map((t, i) => `${i + 1}. [${t.kind}] ${t.title}${t.subtitle ? ` — ${t.subtitle}` : ''} (link: ${t.link})`).join('\n');
  const result = await askClaudeForJson<{ actions: { title: string; reasoning: string; link: string }[] }>(
    'You are a real estate CRM assistant. Given this agent\'s raw attention-needed items, pick the most important 3-5, ' +
      'reorder them by true urgency/impact, and write a short, specific one-sentence reason for each — phrased as direct, actionable advice to the agent. ' +
      'Return JSON: {"actions": [{"title": "<short title>", "reasoning": "<one sentence>", "link": "<the link from the input, copied exactly>"}]}. ' +
      'Only use items from the input list — do not invent new ones.',
    list,
    700,
  );
  return { actions: result.actions ?? [] };
}
