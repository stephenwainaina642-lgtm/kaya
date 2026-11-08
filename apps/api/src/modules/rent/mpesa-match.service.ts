import { z } from 'zod';
import { and, eq, inArray, sql as dsql } from 'drizzle-orm';
import type { MpesaApplyResult, MpesaMatch, MpesaMatchResult, MpesaTransaction } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { clients, leases, properties, rentCharges, rentPayments } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth } from '../crm/common';
import { recordPayment } from './rent.service';

const MAX_TEXT = 300_000;
const MAX_TX = 300;

const CODE = /\b([A-Z][A-Z0-9]{9})\b/;
const PHONE = /(?:\+?254|0)\s?[17](?:[\d*]\s?){8}/;

const digitsOf = (v: string) => v.replace(/[^\d*]/g, '');
/** Normalises 0722..., +254722... and 254722... to the 9 digits after the country code. */
const tail9 = (v: string) => digitsOf(v).replace(/^254/, '').replace(/^0/, '').slice(-9);

/** True when two phone numbers agree on every digit both show (masked ones carry asterisks). */
export function phonesAgree(a: string, b: string): boolean {
  const x = tail9(a), y = tail9(b);
  if (x.length !== 9 || y.length !== 9) return false;
  let compared = 0;
  for (let i = 0; i < 9; i++) {
    if (x[i] === '*' || y[i] === '*') continue;
    if (x[i] !== y[i]) return false;
    compared++;
  }
  // A heavily masked number says too little to identify anyone.
  return compared >= 5;
}

const stripDate = (s: string) => s.replace(/\bon\s+\d{1,2}\/\d{1,2}\/\d{2,4}.*$/i, '').replace(/\bat\s+\d.*$/i, '');

function extractParty(text: string): { name: string; phone: string } {
  const phoneHit = PHONE.exec(text);
  const phone = phoneHit ? phoneHit[0].replace(/\s/g, '') : '';
  const from = /\bfrom\b[\s:-]*(.*)/i.exec(text)?.[1] ?? '';
  const name = stripDate(from).replace(PHONE, ' ').replace(/[^A-Za-z' .-]/g, ' ').replace(/\b(Account|Number|New|Balance|Utility|Confirmed)\b.*$/i, '').replace(/\s+/g, ' ').trim();
  return { name, phone };
}

/** "5/3/26 at 10:15 AM" (Nairobi time) -> ISO. Day first, as Safaricom prints it. */
function smsDate(text: string): string | null {
  const m = /\bon\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i.exec(text);
  if (!m) return null;
  const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  let hour = m[4] ? Number(m[4]) : 12;
  if (m[6]?.toUpperCase() === 'PM' && hour < 12) hour += 12;
  if (m[6]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]), hour - 3, m[5] ? Number(m[5]) : 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const money = (s: string) => Math.round(Number(s.replace(/,/g, '')));

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function csvDate(v: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v) ?? null;
  if (m) return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, (m[4] ? +m[4] : 12) - 3, m[5] ? +m[5] : 0)).toISOString();
  const d = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(v);
  return d ? new Date(Date.UTC(+d[3]!, +d[2]! - 1, +d[1]!, (d[4] ? +d[4] : 12) - 3, d[5] ? +d[5] : 0)).toISOString() : null;
}

/**
 * Reads incoming payments out of pasted M-Pesa confirmation messages, or out of an
 * M-Pesa statement exported as CSV. Anything that is not money received (sent, withdrawn,
 * bought airtime) is ignored.
 */
export function parseMpesa(text: string): MpesaTransaction[] {
  const out: MpesaTransaction[] = [];
  const seen = new Set<string>();
  const push = (t: MpesaTransaction) => { if (!seen.has(t.code) && t.amount > 0) { seen.add(t.code); out.push(t); } };

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0]?.toLowerCase() ?? '';
  if (header.includes('receipt') && (header.includes('paid in') || header.includes('details'))) {
    const cols = splitCsv(lines[0]!).map((c) => c.toLowerCase());
    const at = (name: string) => cols.findIndex((c) => c.includes(name));
    const [iCode, iTime, iDetails, iIn] = [at('receipt'), at('time'), at('details'), at('paid in')];
    for (const line of lines.slice(1)) {
      const c = splitCsv(line);
      const code = (c[iCode] ?? '').toUpperCase();
      const amount = money(c[iIn] ?? '0') || 0;
      if (!CODE.test(code) || !(amount > 0)) continue;
      const { name, phone } = extractParty(c[iDetails] ?? '');
      push({ code, amount, name, phone, paidAt: csvDate(c[iTime] ?? '') });
    }
    return out;
  }

  for (const chunk of text.split(/(?=\b[A-Z][A-Z0-9]{9}\s+Confirmed)/)) {
    const code = /^\s*([A-Z][A-Z0-9]{9})\s+Confirmed/.exec(chunk)?.[1];
    if (!code) continue;
    if (!/\breceived\b/i.test(chunk) || /\b(sent to|paid to|withdraw|bought|airtime)\b/i.test(chunk)) continue;
    const amt = /(?:Ksh|KES)\.?\s?([\d,]+(?:\.\d{1,2})?)/i.exec(chunk);
    if (!amt) continue;
    const { name, phone } = extractParty(chunk);
    push({ code, amount: money(amt[1]!), name, phone, paidAt: smsDate(chunk) });
  }
  return out;
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((t) => t.length >= 3);
const shared = (a: string, b: string) => { const bt = new Set(tokens(b)); return tokens(a).filter((t) => bt.has(t)).length; };

interface OpenCharge { chargeId: string; leaseId: string; period: string; balance: number; tenantName: string; tenantPhone: string; propertyTitle: string }

/** Pure matching step so it can be tested without a database. */
export function matchTransactions(txs: MpesaTransaction[], charges: OpenCharge[], known: Set<string>): MpesaMatchResult {
  const result: MpesaMatchResult = { found: txs.length, matches: [], duplicates: [], unmatched: [] };
  const bal = new Map(charges.map((c) => [c.chargeId, c.balance]));
  const byLease = new Map<string, OpenCharge[]>();
  for (const c of [...charges].sort((x, y) => x.period.localeCompare(y.period))) byLease.set(c.leaseId, [...(byLease.get(c.leaseId) ?? []), c]);

  for (const t of txs) {
    if (known.has(t.code)) { result.duplicates.push(t); continue; }
    const scored = [...byLease.values()].map((cs) => {
      const c = cs[0]!;
      const phone = t.phone && phonesAgree(t.phone, c.tenantPhone) ? 10 : 0;
      const n = shared(t.name, c.tenantName);
      const name = n >= 2 ? 4 : n === 1 ? 2 : 0;
      return { cs, score: phone + name, phone: phone > 0 };
    }).filter((s) => s.score >= 4).sort((a, b) => b.score - a.score);

    if (!scored.length) { result.unmatched.push({ ...t, reason: 'No tenant matches this phone number or name' }); continue; }
    if (scored[1] && scored[1].score === scored[0]!.score) { result.unmatched.push({ ...t, reason: 'More than one tenant could match' }); continue; }

    const best = scored[0]!;
    const open = best.cs.find((c) => (bal.get(c.chargeId) ?? 0) > 0);
    if (!open) { result.unmatched.push({ ...t, reason: `${best.cs[0]!.tenantName} owes nothing right now` }); continue; }
    const balance = bal.get(open.chargeId)!;
    const applyAmount = Math.min(t.amount, balance);
    bal.set(open.chargeId, balance - applyAmount);
    const m: MpesaMatch = {
      ...t, chargeId: open.chargeId, tenantName: open.tenantName, propertyTitle: open.propertyTitle, period: open.period,
      balance, applyAmount, leftover: t.amount - applyAmount, confidence: best.phone ? 'HIGH' : 'MEDIUM',
    };
    result.matches.push(m);
  }
  return result;
}

const matchInput = z.object({ text: z.string().min(1).max(MAX_TEXT) });

export async function matchMpesa(a: Auth, body: unknown): Promise<MpesaMatchResult> {
  const { text } = parse(matchInput, body);
  const txs = parseMpesa(text);
  if (!txs.length) {
    throw new AppError(422, 'VALIDATION_FAILED', 'No M-Pesa payments received were found in that text. Paste the confirmation messages, or an M-Pesa statement CSV.');
  }
  if (txs.length > MAX_TX) throw new AppError(422, 'VALIDATION_FAILED', `Please match ${MAX_TX} payments at a time (found ${txs.length}).`);
  return withTenant(a.organizationId, async (tx) => {
    const rows = await tx.select({
      chargeId: rentCharges.id, leaseId: leases.id, period: rentCharges.period, amount: rentCharges.amount, paid: rentCharges.paidAmount,
      tenantName: clients.fullName, tenantPhone: clients.phone, propertyTitle: properties.title,
    }).from(rentCharges)
      .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
      .innerJoin(clients, eq(clients.id, leases.tenantId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .where(and(eq(leases.status, 'ACTIVE'), dsql`${rentCharges.amount} > ${rentCharges.paidAmount}`));
    const refs = await tx.select({ r: rentPayments.reference }).from(rentPayments)
      .where(and(eq(rentPayments.method, 'MPESA'), inArray(rentPayments.reference, txs.map((t) => t.code))));
    const open: OpenCharge[] = rows.map((r) => ({ ...r, balance: r.amount - r.paid }));
    return matchTransactions(txs, open, new Set(refs.map((r) => r.r!).filter(Boolean)));
  });
}

const applyInput = z.object({
  items: z.array(z.object({
    code: z.string().trim().min(5).max(20),
    chargeId: z.string().uuid(),
    amount: z.number().int().min(1),
    paidAt: z.string().datetime({ offset: true }).nullable().optional(),
  })).min(1).max(MAX_TX),
});

/** Records the payments the agent confirmed. Each is checked again by the normal payment rules, so a stale suggestion cannot overpay. */
export async function applyMpesa(a: Auth, body: unknown): Promise<MpesaApplyResult> {
  const { items } = parse(applyInput, body);
  const result: MpesaApplyResult = { recorded: 0, failed: [] };
  for (const it of items) {
    try {
      await recordPayment(a, it.chargeId, { amount: it.amount, method: 'MPESA', reference: it.code, ...(it.paidAt ? { paidAt: it.paidAt } : {}) });
      result.recorded++;
    } catch (err) {
      result.failed.push({ code: it.code, error: err instanceof AppError ? err.message : 'Could not record this payment' });
    }
  }
  return result;
}
