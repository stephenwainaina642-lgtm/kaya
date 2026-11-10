import crypto from 'node:crypto';
import { z } from 'zod';
import { and, asc, eq, gt, ne } from 'drizzle-orm';
import { effectivePlan, planHasModule, type MpesaSettingsView, type TenantPayStatus } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { clients, leases, organizations, orgMpesa, rentCharges, rentPayments, rentStkRequests } from '../../db/schema';
import { AppError, notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { appUrl } from '../../config/env';
import { encryptSecret, decryptSecret } from '../../lib/secrets';
import { checkCredentials, stkPush, stkQuery, toMsisdn, type MpesaCreds } from '../../lib/mpesa';
import { type Auth } from '../crm/common';
import { chargeStatus } from './rent.service';


const callbackUrl = (secret: string) => `${appUrl}/api/public/mpesa/rent/${secret}`;

const settingsInput = z.object({
  mode: z.enum(['sandbox', 'production']),
  accountType: z.enum(['PAYBILL', 'TILL']),
  shortcode: z.string().trim().regex(/^\d{5,9}$/, 'Shortcode is 5 to 9 digits'),
  // Blank means "keep what is saved"; required the first time (checked below).
  consumerKey: z.string().trim().max(200).optional(),
  consumerSecret: z.string().trim().max(300).optional(),
  passkey: z.string().trim().max(300).optional(),
});

export async function getMpesaSettings(a: Auth): Promise<MpesaSettingsView> {
  const [row] = await withTenant(a.organizationId, (tx) => tx.select().from(orgMpesa));
  if (!row) return { configured: false, mode: 'sandbox', accountType: 'PAYBILL', shortcode: null, callbackUrl: null };
  return { configured: true, mode: row.mode as 'sandbox' | 'production', accountType: row.accountType as 'PAYBILL' | 'TILL', shortcode: row.shortcode, callbackUrl: callbackUrl(row.callbackSecret) };
}

export async function saveMpesaSettings(a: Auth, body: unknown): Promise<MpesaSettingsView> {
  const input = parse(settingsInput, body);
  const [existing] = await withTenant(a.organizationId, (tx) => tx.select().from(orgMpesa));
  const consumerKey = input.consumerKey || existing?.consumerKey;
  const consumerSecret = input.consumerSecret || (existing ? decryptSecret(existing.consumerSecretEnc) : null);
  const passkey = input.passkey || (existing ? decryptSecret(existing.passkeyEnc) : null);
  if (!consumerKey || !consumerSecret || !passkey) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Enter the consumer key, consumer secret and passkey from your Daraja app.', { fields: { consumerKey: 'Required' } });
  }
  const callbackSecret = existing?.callbackSecret ?? crypto.randomBytes(24).toString('base64url');
  const creds: MpesaCreds = {
    env: input.mode, consumerKey, consumerSecret, shortcode: input.shortcode, passkey, callbackUrl: callbackUrl(callbackSecret),
    transactionType: input.accountType === 'TILL' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
  };
  if (!(await checkCredentials(creds))) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Safaricom did not accept those keys. Check the consumer key and secret, and that "Sandbox" or "Live" matches where you created them.', { fields: { consumerKey: 'Not accepted' } });
  }
  await withTenant(a.organizationId, async (tx) => {
    const values = {
      mode: input.mode, accountType: input.accountType, shortcode: input.shortcode, consumerKey,
      consumerSecretEnc: encryptSecret(consumerSecret), passkeyEnc: encryptSecret(passkey), updatedAt: new Date(),
    };
    if (existing) await tx.update(orgMpesa).set(values).where(eq(orgMpesa.id, existing.id));
    else await tx.insert(orgMpesa).values({ organizationId: a.organizationId, callbackSecret, ...values });
    await recordAudit(tx, { organizationId: a.organizationId, actorId: a.userId, action: 'UPDATE', entityType: 'organization', entityId: a.organizationId, summary: 'Updated M-Pesa collection settings' });
  });
  return getMpesaSettings(a);
}

export async function removeMpesaSettings(a: Auth): Promise<void> {
  await withTenant(a.organizationId, async (tx) => {
    await tx.delete(orgMpesa).where(eq(orgMpesa.organizationId, a.organizationId));
    await recordAudit(tx, { organizationId: a.organizationId, actorId: a.userId, action: 'DELETE', entityType: 'organization', entityId: a.organizationId, summary: 'Removed M-Pesa collection settings' });
  });
}

function credsOf(row: typeof orgMpesa.$inferSelect): MpesaCreds | null {
  const consumerSecret = decryptSecret(row.consumerSecretEnc);
  const passkey = decryptSecret(row.passkeyEnc);
  if (!consumerSecret || !passkey) return null;
  return {
    env: row.mode as 'sandbox' | 'production', consumerKey: row.consumerKey, consumerSecret, shortcode: row.shortcode, passkey,
    callbackUrl: callbackUrl(row.callbackSecret), transactionType: row.accountType === 'TILL' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
  };
}

/** True when this agency can take rent by M-Pesa prompt (so the tenant portal shows a Pay button). */
export async function canCollectByMpesa(organizationId: string): Promise<boolean> {
  const rows = await withTenant(organizationId, (tx) => tx.select({ id: orgMpesa.id }).from(orgMpesa));
  return rows.length > 0;
}

async function leaseFromToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw notFound('Page');
  const [hit] = await systemDb.select({
    leaseId: leases.id, organizationId: leases.organizationId, status: leases.status, tenantPhone: clients.phone, reference: leases.id,
    plan: organizations.plan, planExpiresAt: organizations.planExpiresAt, suspendedAt: organizations.suspendedAt, agency: organizations.name,
  }).from(leases).innerJoin(organizations, eq(organizations.id, leases.organizationId)).innerJoin(clients, eq(clients.id, leases.tenantId))
    .where(eq(leases.portalToken, token));
  if (!hit || hit.suspendedAt || !planHasModule(effectivePlan(hit.plan, hit.planExpiresAt), 'rentManagement')) throw notFound('Page');
  return hit;
}

const payInput = z.object({
  amount: z.number().int().min(10).max(1_000_000).optional(),
  phone: z.string().trim().max(20).regex(/^\+?[0-9]*$/, 'Digits only').optional(),
});

const COOLDOWN_MS = 60_000;

/** Sends the M-Pesa PIN prompt to the tenant's phone for their outstanding rent (or a part of it). */
export async function startTenantPayment(token: string, body: unknown): Promise<TenantPayStatus> {
  const input = parse(payInput, body ?? {});
  const hit = await leaseFromToken(token);
  if (hit.status !== 'ACTIVE') throw notFound('Page');

  return withTenant(hit.organizationId, async (tx) => {
    const [cfg] = await tx.select().from(orgMpesa);
    const creds = cfg ? credsOf(cfg) : null;
    if (!creds) throw new AppError(409, 'NOT_AVAILABLE', 'Paying here is not set up yet. Use the payment details on this page.');

    const charges = await tx.select().from(rentCharges).where(and(eq(rentCharges.leaseId, hit.leaseId), ne(rentCharges.status, 'PAID')));
    const outstanding = charges.reduce((n, c) => n + (c.amount - c.paidAmount), 0);
    if (outstanding <= 0) throw new AppError(409, 'NOTHING_DUE', 'Nothing is due right now.');
    const amount = Math.min(input.amount ?? outstanding, outstanding);

    const msisdn = toMsisdn(input.phone || hit.tenantPhone || '');
    if (!msisdn) throw new AppError(422, 'VALIDATION_FAILED', 'Enter the M-Pesa number to send the prompt to, e.g. 0712345678.', { fields: { phone: 'Not a Kenyan mobile number' } });

    const [recent] = await tx.select({ id: rentStkRequests.id }).from(rentStkRequests)
      .where(and(eq(rentStkRequests.leaseId, hit.leaseId), eq(rentStkRequests.status, 'PENDING'), gt(rentStkRequests.createdAt, new Date(Date.now() - COOLDOWN_MS)))).limit(1);
    if (recent) throw new AppError(429, 'RATE_LIMITED', 'A prompt was just sent. Check your phone, or wait a minute to try again.');

    const reference = `RENT-${hit.leaseId.slice(0, 6).toUpperCase()}`;
    const push = await stkPush({ msisdn, amount, reference, description: 'Rent' }, creds);
    const [row] = await tx.insert(rentStkRequests).values({
      organizationId: hit.organizationId, leaseId: hit.leaseId, amount, phone: msisdn, checkoutRequestId: push.checkoutRequestId,
    }).returning();
    return toStatus(row!);
  });
}

const toStatus = (r: typeof rentStkRequests.$inferSelect): TenantPayStatus => ({
  id: r.id, status: r.status as TenantPayStatus['status'], amount: r.amount, message: r.resultDesc, receipt: r.receipt,
});

export async function getTenantPaymentStatus(token: string, requestId: string): Promise<TenantPayStatus> {
  parse(z.string().uuid(), requestId);
  const hit = await leaseFromToken(token);
  const [row] = await withTenant(hit.organizationId, (tx) => tx.select().from(rentStkRequests)
    .where(and(eq(rentStkRequests.id, requestId), eq(rentStkRequests.leaseId, hit.leaseId))));
  if (!row) throw notFound('Payment');

  // If Safaricom's callback hasn't arrived after a while, ask them directly.
  if (row.status === 'PENDING' && Date.now() - row.createdAt.getTime() > 25_000) {
    try {
      const [cfg] = await withTenant(hit.organizationId, (tx) => tx.select().from(orgMpesa));
      const creds = cfg ? credsOf(cfg) : null;
      const q = creds ? await stkQuery(row.checkoutRequestId, creds) : null;
      if (q && q.resultCode !== 0) await settle(row, { ok: false, reason: q.resultDesc || 'Payment was not completed' });
      // A success we only learn about by query carries no receipt or amount, so it is left for the callback / agent.
    } catch (err) {
      console.warn('[rent-mpesa] status query failed', err);
    }
    const [fresh] = await withTenant(hit.organizationId, (tx) => tx.select().from(rentStkRequests).where(eq(rentStkRequests.id, requestId)));
    return toStatus(fresh ?? row);
  }
  return toStatus(row);
}

type Outcome = { ok: true; receipt: string | null; paid: number } | { ok: false; reason: string };

async function settle(req: typeof rentStkRequests.$inferSelect, outcome: Outcome): Promise<void> {
  await withTenant(req.organizationId, async (tx) => {
    // Lock the request so a callback and a status check can't both settle it.
    const [cur] = await tx.select().from(rentStkRequests).where(eq(rentStkRequests.id, req.id)).for('update');
    if (!cur || cur.status !== 'PENDING') return;

    if (!outcome.ok) {
      await tx.update(rentStkRequests).set({ status: 'FAILED', resultDesc: outcome.reason, settledAt: new Date() }).where(eq(rentStkRequests.id, cur.id));
      return;
    }
    const receipt = outcome.receipt?.toUpperCase() ?? null;
    if (receipt) {
      const [dup] = await tx.select({ id: rentPayments.id }).from(rentPayments).where(and(eq(rentPayments.method, 'MPESA'), eq(rentPayments.reference, receipt))).limit(1);
      if (dup) { await tx.update(rentStkRequests).set({ status: 'PAID', receipt, settledAt: new Date() }).where(eq(rentStkRequests.id, cur.id)); return; }
    }
    // Oldest unpaid month first, never more than is owed.
    const charges = await tx.select().from(rentCharges)
      .where(and(eq(rentCharges.leaseId, cur.leaseId), ne(rentCharges.status, 'PAID'))).orderBy(asc(rentCharges.period)).for('update');
    let left = outcome.paid;
    for (const c of charges) {
      if (left <= 0) break;
      const apply = Math.min(left, c.amount - c.paidAmount);
      if (apply <= 0) continue;
      await tx.insert(rentPayments).values({ organizationId: cur.organizationId, chargeId: c.id, amount: apply, method: 'MPESA', reference: receipt, recordedById: null });
      const paid = c.paidAmount + apply;
      await tx.update(rentCharges).set({ paidAmount: paid, status: chargeStatus(c.amount, paid) }).where(eq(rentCharges.id, c.id));
      left -= apply;
    }
    await tx.update(rentStkRequests).set({
      status: 'PAID', receipt, settledAt: new Date(),
      resultDesc: left > 0 ? `${left} was paid beyond what was owed; please refund or credit it.` : null,
    }).where(eq(rentStkRequests.id, cur.id));
    await recordAudit(tx, { organizationId: cur.organizationId, actorId: null, action: 'CREATE', entityType: 'rent_payment', entityId: cur.leaseId, summary: `Tenant paid ${outcome.paid.toLocaleString('en-US')} by M-Pesa from their portal (${receipt ?? 'no receipt'})` });
  });
}

interface StkCallbackBody {
  Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; ResultDesc?: string; CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] } } };
}

/** Safaricom's result for a rent prompt. The secret in the URL is the agency's own; it must match the request's agency. */
export async function handleRentCallback(secret: string, body: unknown): Promise<void> {
  const cb = (body as StkCallbackBody)?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID || !/^[A-Za-z0-9_-]{20,80}$/.test(secret)) return;
  const [cfg] = await systemDb.select({ organizationId: orgMpesa.organizationId }).from(orgMpesa).where(eq(orgMpesa.callbackSecret, secret));
  if (!cfg) return;
  const [req] = await systemDb.select().from(rentStkRequests)
    .where(and(eq(rentStkRequests.checkoutRequestId, cb.CheckoutRequestID), eq(rentStkRequests.organizationId, cfg.organizationId)));
  if (!req) return;

  if (cb.ResultCode !== 0) return void (await settle(req, { ok: false, reason: cb.ResultDesc || 'Payment was not completed' }));
  const items = new Map((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
  const paid = Math.floor(Number(items.get('Amount')));
  if (!Number.isFinite(paid) || paid < 1) return void (await settle(req, { ok: false, reason: 'Safaricom reported no amount' }));
  // Record what was actually paid, even if it differs from what was asked; the agent sees the real amount.
  await settle(req, { ok: true, receipt: items.get('MpesaReceiptNumber') ? String(items.get('MpesaReceiptNumber')) : null, paid });
}
