import type { LeaseItem } from '@kaya/shared';
import { money as kes } from '../lib/currency';

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const longDate = (d: string) => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

export type LetterKind = 'RENEWAL' | 'INCREASE';

export interface LetterInput {
  kind: LetterKind;
  newRent: number;
  /** Renewal: the new end date. Increase: the date the new rent starts. */
  date: string;
  replyBy: string;
  signedBy: string;
}

/**
 * Opens a print-ready letter to the tenant. The wording is deliberately plain
 * and refers to the tenancy agreement for notice terms, because Kaya does not
 * know what each agreement requires.
 */
export function printLeaseLetter(agencyName: string, lease: LeaseItem, input: LetterInput): void {
  const today = longDate(new Date().toISOString().slice(0, 10));
  const change = input.newRent - lease.rentAmount;
  const rentLine = change === 0
    ? `The monthly rent will stay at ${kes(input.newRent)}.`
    : `The monthly rent will change from ${kes(lease.rentAmount)} to ${kes(input.newRent)} (${change > 0 ? 'an increase' : 'a reduction'} of ${kes(Math.abs(change))}).`;

  const title = input.kind === 'RENEWAL' ? 'Offer to renew your tenancy' : 'Notice of rent review';
  const body = input.kind === 'RENEWAL'
    ? `<p>Your tenancy of <strong>${esc(lease.propertyTitle)}</strong>${lease.endDate ? ` is due to end on ${esc(longDate(lease.endDate))}` : ' is open-ended'}. We would be glad to have you stay, and offer to renew it until <strong>${esc(longDate(input.date))}</strong>.</p>
<p>${esc(rentLine)} All other terms of your tenancy agreement continue as they are.</p>
<p>Please let us know by <strong>${esc(longDate(input.replyBy))}</strong> whether you would like to accept. If you would prefer not to renew, please tell us so that we can plan the handover.</p>`
    : `<p>This is to notify you of a change to the rent for <strong>${esc(lease.propertyTitle)}</strong>, in line with your tenancy agreement.</p>
<p>${esc(rentLine)} The new rent applies from <strong>${esc(longDate(input.date))}</strong>. Rent due before that date is unchanged.</p>
<p>If you have any questions or would like to discuss this, please contact us by <strong>${esc(longDate(input.replyBy))}</strong>.</p>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} - ${esc(lease.tenantName)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1c2b24;max-width:640px;margin:56px auto;padding:0 28px;line-height:1.6;font-size:15px}
  h1{font-size:22px;margin:0}.date{color:#5b6b63;font-size:13px;margin:4px 0 32px}h2{font-size:17px;margin:24px 0 12px}
  .sign{margin-top:48px}@media print{body{margin:0}}
</style></head><body>
<h1>${esc(agencyName)}</h1><p class="date">${esc(today)}</p>
<p>To: <strong>${esc(lease.tenantName)}</strong><br>${esc(lease.propertyTitle)}</p>
<h2>${esc(title)}</h2>
<p>Dear ${esc(lease.tenantName.split(/\s+/)[0] || 'tenant')},</p>
${body}
<p>Thank you.</p>
<p class="sign">Yours sincerely,<br><br><strong>${esc(input.signedBy)}</strong><br>${esc(agencyName)}</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
