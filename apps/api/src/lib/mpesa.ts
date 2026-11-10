import { env, appUrl } from '../config/env';
import { AppError } from './errors';

// Safaricom Daraja "Lipa na M-Pesa Online" (STK push). The customer gets a
// PIN prompt on their phone; the result arrives later on our callback URL.
// Docs: https://developer.safaricom.co.ke/APIs/MpesaExpressSimulate

export function mpesaConfigured(): boolean {
  return !!(env.MPESA_CONSUMER_KEY && env.MPESA_CONSUMER_SECRET && env.MPESA_SHORTCODE && env.MPESA_PASSKEY && env.MPESA_CALLBACK_SECRET);
}

/** Daraja credentials. Defaults to Kaya's own (billing); a letting agency passes its own to collect rent. */
export interface MpesaCreds {
  env: 'sandbox' | 'production';
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  /** Till numbers use BuyGoods; paybills use PayBill. */
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
}

const platformCreds = (): MpesaCreds => ({
  env: env.MPESA_ENV, consumerKey: env.MPESA_CONSUMER_KEY!, consumerSecret: env.MPESA_CONSUMER_SECRET!, shortcode: env.MPESA_SHORTCODE!,
  passkey: env.MPESA_PASSKEY!, callbackUrl: `${appUrl}/api/billing/mpesa/callback/${env.MPESA_CALLBACK_SECRET}`, transactionType: 'CustomerPayBillOnline',
});

const host = (c: MpesaCreds) => (c.env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');

/** 07XXXXXXXX / 7XXXXXXXX / +2547XXXXXXXX -> 2547XXXXXXXX, or null if it isn't a Kenyan mobile number. */
export function toMsisdn(raw: string): string | null {
  const d = raw.replace(/[\s\-().+]/g, '');
  const m = /^(?:254|0)?([17]\d{8})$/.exec(d);
  return m ? `254${m[1]}` : null;
}

const timestamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

async function token(c: MpesaCreds): Promise<string> {
  const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64');
  const res = await fetch(`${host(c)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new AppError(502, 'PAYMENT_PROVIDER', 'Could not reach M-Pesa. Please try again shortly.');
  return ((await res.json()) as { access_token: string }).access_token;
}

/** True when Safaricom accepts these keys. Used to reject typos when an agency saves its credentials. */
export async function checkCredentials(c: MpesaCreds): Promise<boolean> {
  try { await token(c); return true; } catch { return false; }
}

function credentials(c: MpesaCreds) {
  const ts = timestamp();
  const password = Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString('base64');
  return { ts, password };
}

export interface StkPushInput { msisdn: string; amount: number; reference: string; description: string }
export interface StkPushResult { merchantRequestId: string; checkoutRequestId: string }

export async function stkPush(input: StkPushInput, c: MpesaCreds = platformCreds()): Promise<StkPushResult> {
  const { ts, password } = credentials(c);
  const res = await fetch(`${host(c)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token(c)}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      BusinessShortCode: c.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: c.transactionType,
      Amount: input.amount,
      PartyA: input.msisdn,
      PartyB: c.shortcode,
      PhoneNumber: input.msisdn,
      CallBackURL: c.callbackUrl,
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
export async function stkQuery(checkoutRequestId: string, c: MpesaCreds = platformCreds()): Promise<StkQueryResult | null> {
  const { ts, password } = credentials(c);
  const res = await fetch(`${host(c)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token(c)}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ BusinessShortCode: c.shortcode, Password: password, Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (body.ResultCode === undefined) return null; // still processing, or rate-limited
  return { resultCode: Number(body.ResultCode), resultDesc: body.ResultDesc ?? '' };
}
