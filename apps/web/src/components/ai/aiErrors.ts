import { ApiError } from '../../lib/api';

/** Turns an AI-endpoint error into a short, honest message for the agent — distinguishing
 * "your plan doesn't include this" from "this workspace hasn't set up an API key yet" from
 * any other failure, rather than showing a generic "something went wrong". */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'PLAN_UPGRADE_REQUIRED') return 'AI features need a Growth or Pro plan. Ask your workspace admin to upgrade.';
    if (err.code === 'AI_NOT_CONFIGURED') return 'AI features aren’t set up for this workspace yet — ask your platform admin to add an Anthropic API key.';
    return err.message;
  }
  return 'Something went wrong. Try again.';
}
