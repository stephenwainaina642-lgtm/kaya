import type { Language } from '@kaya/shared';
import { STATEMENT_WORDS, money } from './messages';
import { env } from '../config/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Captured instead of sent when NODE_ENV=test, so tests can read the link out of an email. */
export const testOutbox: Mail[] = [];

/**
 * Sends one transactional email through Resend's HTTP API (no SDK needed).
 * Never throws for delivery problems: callers like "forgot password" must
 * respond identically whether or not an account exists, so a mail failure
 * is logged and swallowed rather than surfaced to the requester.
 * Returns true if the message was handed to a provider.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (env.NODE_ENV === 'test') {
    testOutbox.push(mail);
    return true;
  }
  if (!env.RESEND_API_KEY) {
    console.warn(`[mailer] RESEND_API_KEY is not set — email to ${mail.to} ("${mail.subject}") was NOT sent.`);
    if (env.NODE_ENV !== 'production') console.warn(`[mailer] (dev) body:\n${mail.text}`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) {
      console.error(`[mailer] Resend rejected email to ${mail.to}: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mailer] failed to reach Resend', err);
    return false;
  }
}

export function passwordResetEmail(name: string, link: string, ttlMinutes: number): Omit<Mail, 'to'> {
  const subject = 'Reset your Kaya password';
  const text = `Hi ${name},\n\nWe received a request to reset your Kaya password. Use this link within ${ttlMinutes} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.\n\n— Kaya`;
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#1c2420">
<h2 style="font-family:'IBM Plex Sans',Arial,sans-serif;margin:0 0 12px">Reset your password</h2>
<p>Hi ${esc(name)},</p>
<p>We received a request to reset your Kaya password. This link works for ${ttlMinutes} minutes.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#2f6b45;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
<p style="color:#5b6a61;font-size:13px">If you didn't ask for this, ignore this email — your password won't change.</p></div>`;
  return { subject, text, html };
}

const escHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface RentReceiptData {
  agencyName: string;
  tenantName: string;
  propertyTitle: string;
  periodLabel: string;
  receiptNo: string;
  amount: number;
  method: string;
  reference: string | null;
  paidOn: string;
  rentAmount: number;
  paidToDate: number;
  balance: number;
  currency?: string;
}

export function rentReceiptEmail(d: RentReceiptData): Omit<Mail, 'to'> {
  const kes = (n: number) => `${d.currency ?? 'KES'} ${n.toLocaleString('en-US')}`;
  const subject = `Rent receipt ${d.receiptNo} — ${d.periodLabel}`;
  const rows: [string, string][] = [
    ['Property', d.propertyTitle],
    ['Rent for', d.periodLabel],
    ['Method', d.method + (d.reference ? ` (${d.reference})` : '')],
    ['Date received', d.paidOn],
    ['Rent for the month', kes(d.rentAmount)],
    ['Paid to date this month', kes(d.paidToDate)],
    ['Balance remaining', kes(d.balance)],
  ];
  const text = `Hi ${d.tenantName},\n\n${d.agencyName} has received ${kes(d.amount)} (receipt ${d.receiptNo}).\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nThank you.\n— ${d.agencyName}`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:auto;color:#1c2420">
<h2 style="font-family:'IBM Plex Sans',Arial,sans-serif;margin:0 0 4px">${escHtml(d.agencyName)}</h2>
<p style="color:#5b6a61;font-size:13px;margin:0 0 20px">Rent receipt ${escHtml(d.receiptNo)}</p>
<p>Hi ${escHtml(d.tenantName)}, we have received your payment of</p>
<p style="font-family:'IBM Plex Sans',Arial,sans-serif;font-size:30px;margin:4px 0 16px">${escHtml(kes(d.amount))}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e3e8e5;color:#5b6a61">${escHtml(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e3e8e5;text-align:right">${escHtml(v)}</td></tr>`).join('')}</table>
<p style="color:#5b6a61;font-size:13px;margin-top:20px">Thank you.</p></div>`;
  return { subject, text, html };
}

export interface OwnerStatementEmailData {
  agencyName: string;
  ownerName: string;
  periodLabel: string;
  collected: number;
  feeAndTax: number;
  repairs: number;
  net: number;
  lines: { property: string; tenant: string; rentDue: number; collected: number }[];
  portalUrl: string | null;
  currency?: string;
  lang?: Language;
}

export function ownerStatementEmail(d: OwnerStatementEmailData): Omit<Mail, 'to'> {
  const w = STATEMENT_WORDS[d.lang ?? 'en'];
  const kes = (n: number) => money(n, d.currency, d.lang ?? 'en');
  const subject = w.subject(d.agencyName, d.periodLabel);
  const summary: [string, string][] = [
    [w.collected, kes(d.collected)],
    [w.fee, `− ${kes(d.feeAndTax)}`],
    ...(d.repairs > 0 ? [[w.repairs, `− ${kes(d.repairs)}`] as [string, string]] : []),
    [w.paid, kes(d.net)],
  ];
  const text = `${w.hi(d.ownerName)},\n\n${w.label} - ${d.periodLabel}.\n\n${summary.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${
    d.lines.map((l) => `${l.property} (${l.tenant}): ${w.due} ${kes(l.rentDue)}, ${w.collected.toLowerCase()} ${kes(l.collected)}`).join('\n')
  }${d.portalUrl ? `\n\n${w.see} ${d.portalUrl}` : ''}\n\n${d.agencyName}`;
  const row = (k: string, v: string, bold = false) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #e3e8e5;color:#5b6a61">${escHtml(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e3e8e5;text-align:right;${bold ? 'font-weight:700' : ''}">${escHtml(v)}</td></tr>`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#1c2420">
<h2 style="font-family:'IBM Plex Sans',Arial,sans-serif;margin:0 0 4px">${escHtml(d.agencyName)}</h2>
<p style="color:#5b6a61;font-size:13px;margin:0 0 20px">${escHtml(w.label)} · ${escHtml(d.periodLabel)}</p>
<p>${escHtml(w.hi(d.ownerName))}, ${escHtml(w.intro(d.periodLabel))}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${summary.map(([k, v], i) => row(k, v, i === summary.length - 1)).join('')}</table>
<p style="margin:20px 0 6px;font-size:13px;color:#5b6a61">${escHtml(w.byProperty)}</p>
<table style="width:100%;border-collapse:collapse;font-size:13px">${d.lines.map((l) => row(`${l.property} (${l.tenant})`, `${kes(l.collected)} ${w.of} ${kes(l.rentDue)}`)).join('')}</table>
${d.portalUrl ? `<p style="margin-top:24px"><a href="${escHtml(d.portalUrl)}" style="background:#2451d6;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">${escHtml(w.seeAll)}</a></p><p style="font-size:12px;color:#5b6a61">${escHtml(w.private)}</p>` : ''}
</div>`;
  return { subject, text, html };
}
