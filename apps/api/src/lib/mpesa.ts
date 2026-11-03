import { env, appUrl } from '../config/env';
import { AppError } from './errors';

// Safaricom Daraja "Lipa na M-Pesa Online" (STK push). The customer gets a
// PIN prompt on their phone; the result arrives later on our callback URL.
// Docs: https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate

export function mpesaConfigured(): boolean {
  return !!(env.MPESA_CONSUMER_KEY && env.MPESA_CONSUMER_SECRET && env.MPESA_SHORTCODE && env.MPESA_PASSKEY && env.MPESA_CALLBACK_SECRET);
}

const host = () => (env.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');

/** 07XXXXXXXX / 7XXXXXXXX / +2547XXXXXXXX -> 2547XXXXXXXX, or null if it isn't a Kenyan mobile number. */
export function toMsisdn(raw: string): string | null {
  const d = raw.replace(/[\s\-().+]/g, '');
  const m = /^(?:254|0)?([17]\d{8})$/.exec(d);
  return m ? `254${m[1]}` : null;
}

const timestamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

async function token(): Promise<string> {
  const basic = Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${host()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new AppError(502, 'PAYMENT_PROVIDER', 'Could not reach M-Pesa. Please try again shortly.');
  return ((await res.json()) as { access_token: string }).access_token;
}

function credentials() {
  const ts = timestamp();
  const password = Buffer.from(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${ts}`).toString('base64');
  return { ts, password };
}

export interface StkPushInput { msisdn: string; amount: number; reference: string; description: string }
export interface StkPushResult { merchantRequestId: string; checkoutRequestId: string }

export async function stkPush(input: StkPushInput): Promise<StkPushResult> {
  const { ts, password } = credentials();
  const res = await fetch(`${host()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      BusinessShortCode: env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: ts,
      TransactionType: 'CustomerPayBillOnline',
      Amount: input.amount,
      PartyA: input.msisdn,
      PartyB: env.MPESA_SHORTCODE,
      PhoneNumber: input.msisdn,
      CallBackURL: `${appUrl}/api/billing/mpesa/callback/${env.MPESA_CALLBACK_SECRET}`,
      AccountReference: input.reference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
    throw new AppError(502, 'PAYMENT_PROVIDER', body.errorMessage || body.CustomerMessage || 'M-Pesa could not start the payment.');
  }
  return { merchantRequestId: body.MerchantRequestID ?? '', checkoutRequestId: body.CheckoutRequestID };
}

export interface StkQueryResult { resultCode: number; resultDesc: string }

/** Asks Safaricom what happened to a push whose callback we never received. Returns null while still processing. */
export async function stkQuery(checkoutRequestId: string): Promise<StkQueryResult | null> {
  const { ts, password } = credentials();
  const res = await fetch(`${host()}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ BusinessShortCode: env.MPESA_SHORTCODE, Password: password, Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (body.ResultCode === undefined) return null; // still processing, or rate-limited
  return { resultCode: Number(body.ResultCode), resultDesc: body.ResultDesc ?? '' };
}
