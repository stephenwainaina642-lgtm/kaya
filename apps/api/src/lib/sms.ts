import { env } from '../config/env';
import { toMsisdn } from './mpesa';

export interface Sms { to: string; text: string }

/** Captured instead of sent when NODE_ENV=test. */
export const testSmsOutbox: Sms[] = [];

export function smsConfigured(): boolean {
  return env.NODE_ENV === 'test' || !!(env.AT_USERNAME && env.AT_API_KEY);
}

/**
 * Sends one SMS through Africa's Talking. `to` is any Kenyan mobile format.
 * Never throws: returns false when the number is unusable, SMS is not set up,
 * or the provider rejects it, so one bad number cannot stop a batch.
 */
export async function sendSms(to: string, text: string): Promise<boolean> {
  const msisdn = toMsisdn(to);
  if (!msisdn) return false;
  if (env.NODE_ENV === 'test') { testSmsOutbox.push({ to: `+${msisdn}`, text }); return true; }
  if (!env.AT_USERNAME || !env.AT_API_KEY) return false;
  try {
    const body = new URLSearchParams({ username: env.AT_USERNAME, to: `+${msisdn}`, message: text });
    if (env.AT_SENDER_ID) body.set('from', env.AT_SENDER_ID);
    const host = env.AT_USERNAME === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) { console.error(`[sms] Africa's Talking rejected message: ${res.status} ${await res.text()}`); return false; }
    const json = (await res.json()) as { SMSMessageData?: { Recipients?: { statusCode?: number }[] } };
    const status = json.SMSMessageData?.Recipients?.[0]?.statusCode;
    return status === 100 || status === 101 || status === 102;
  } catch (err) {
    console.error('[sms] failed to reach Africa\'s Talking', err);
    return false;
  }
}
