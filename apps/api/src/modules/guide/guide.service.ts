import { z } from 'zod';
import { GUIDE_AREAS, guideAreasFor, keywordGuide, type GuideAnswer, type GuideArea } from '@kaya/shared';
import { askClaudeForJson, isAiConfigured } from '../../lib/ai';
import { parse } from '../../lib/validate';
import { systemDb } from '../../db/system';
import { organizations } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { type Auth } from '../crm/common';

export const guideInput = z.object({ question: z.string().trim().min(2).max(300) });

/** Keeps only links to areas this person can open, in the order the model gave them, at most three. */
export function cleanLinks(paths: unknown, allowed: GuideArea[]): GuideAnswer['links'] {
  if (!Array.isArray(paths)) return [];
  const byPath = new Map(allowed.map((a) => [a.to, a]));
  const out: GuideAnswer['links'] = [];
  for (const p of paths) {
    const a = typeof p === 'string' ? byPath.get(p) : undefined;
    if (a && !out.some((o) => o.to === a.to)) out.push({ to: a.to, title: a.title });
  }
  return out.slice(0, 3);
}

/**
 * Answers "how do I…" questions about Kaya itself. Only the question and the catalogue of screens are sent to the
 * AI: no client, lead, owner or money data ever leaves the system. Without an API key, or if the AI fails, the
 * built-in keyword guide answers instead, so the assistant always works.
 */
export async function askGuide(a: Auth, body: unknown): Promise<GuideAnswer> {
  const { question } = parse(guideInput, body);
  const [org] = await systemDb.select({ plan: organizations.plan, expires: organizations.planExpiresAt }).from(organizations).where(eq(organizations.id, a.organizationId));
  const areas = guideAreasFor(a.role, org?.plan ?? 'STARTER', org?.expires ? org.expires.toISOString() : null);
  const fallback = () => keywordGuide(question, areas);
  if (!isAiConfigured()) return fallback();

  const catalogue = areas.map((x) => `${x.to} | ${x.title}: ${x.summary}`).join('\n');
  try {
    const r = await askClaudeForJson<{ answer?: unknown; paths?: unknown }>(
      `You are the built-in guide for Kaya, a CRM and property-management app for real estate agencies in East Africa. ` +
      `Answer the user's question about how to do something in Kaya, using ONLY the screens listed below. ` +
      `Be practical and warm, 2 to 4 short sentences, plain words, no markdown. Say which screen to open and what to do there. ` +
      `If Kaya cannot do what they ask, say so honestly instead of inventing a feature. If the question is not about using Kaya, say you can only help with Kaya. ` +
      `Return JSON: {"answer": string, "paths": string[]} where paths lists up to 3 screen paths (exactly as written below) worth opening.\n\nScreens:\n${catalogue}`,
      question, 400,
    );
    const answer = typeof r.answer === 'string' ? r.answer.trim().slice(0, 700) : '';
    if (!answer) return fallback();
    return { answer, links: cleanLinks(r.paths, areas), ai: true };
  } catch (err) {
    console.warn('[guide] AI unavailable, using the built-in guide', err);
    return fallback();
  }
}

