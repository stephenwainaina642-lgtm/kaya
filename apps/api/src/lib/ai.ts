import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { AppError } from './errors';

// claude-haiku-5-5 is Anthropic's fastest/cheapest current model, built for
// exactly this kind of high-volume, latency-sensitive classification and
// short-text-generation work (lead scoring, drafting a short message,
// summarizing a handful of timeline entries) — see
// https://platform.claude.com/docs/en/models/overview
const MODEL = 'claude-haiku-5-5';

let client: Anthropic | null = null;
if (env.ANTHROPIC_API_KEY) {
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export function isAiConfigured(): boolean {
  return client !== null;
}

export function aiNotConfigured(): AppError {
  return new AppError(
    503,
    'AI_NOT_CONFIGURED',
    'AI features need an Anthropic API key configured on the server. Ask your platform admin to set one up.',
  );
}

/**
 * Sends a single-turn prompt to Claude and returns the plain text response.
 * Every caller supplies its own system prompt describing exactly what's
 * wanted and what data it's allowed to use — see modules/ai/ai.service.ts.
 */
export async function askClaude(system: string, userMessage: string, maxTokens = 1024): Promise<string> {
  if (!client) throw aiNotConfigured();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new AppError(502, 'AI_EMPTY_RESPONSE', 'The AI did not return a usable response. Try again.');
  }
  return textBlock.text.trim();
}

/** Same as askClaude, but asks for JSON and parses it — throws a clear error if the model didn't comply. */
export async function askClaudeForJson<T>(system: string, userMessage: string, maxTokens = 1024): Promise<T> {
  const text = await askClaude(
    `${system}\n\nRespond with ONLY a single valid JSON object — no markdown code fences, no commentary before or after it.`,
    userMessage,
    maxTokens,
  );
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI returned something we could not understand. Try again.');
  }
}
