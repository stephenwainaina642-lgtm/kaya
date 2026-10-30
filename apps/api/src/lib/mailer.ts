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
<h2 style="font-family:Georgia,serif;margin:0 0 12px">Reset your password</h2>
<p>Hi ${esc(name)},</p>
<p>We received a request to reset your Kaya password. This link works for ${ttlMinutes} minutes.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#2f6b45;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
<p style="color:#5b6a61;font-size:13px">If you didn't ask for this, ignore this email — your password won't change.</p></div>`;
  return { subject, text, html };
}
