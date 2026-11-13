import { periodLabel, type RentChargeItem, type RentPaymentItem } from '@kaya/shared';
import { money as kes } from '../lib/currency';

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const receiptNumber = (paymentId: string) => `RCT-${paymentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/**
 * Opens a print-ready rent receipt. Names come from user-entered records, so
 * every value is HTML-escaped before it goes into the document.
 */
export function printRentReceipt(agencyName: string, charge: RentChargeItem, payment: RentPaymentItem): void {
  const method = payment.method === 'MPESA' ? 'M-Pesa' : payment.method[0] + payment.method.slice(1).toLowerCase();
  const rows: [string, string][] = [
    ['Received from', charge.tenantName],
    ['Property', charge.propertyTitle],
    ['Rent for', periodLabel(charge.period)],
    ['Payment method', method + (payment.reference ? ` (${payment.reference})` : '')],
    ['Date received', new Date(payment.paidAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Rent for the month', kes(charge.amount)],
    ['Paid to date this month', kes(charge.paidAmount)],
    ['Balance remaining', kes(charge.balance)],
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(receiptNumber(payment.id))}</title>
<style>
  body{font-family:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f1419;max-width:560px;margin:48px auto;padding:0 24px}
  h1{font-size:22px;margin:0}.sub{color:#5b6470;font-size:13px;margin:4px 0 28px}
  .amount{font-size:34px;margin:0 0 4px}.no{font-size:12px;color:#5b6470;letter-spacing:.08em;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
  td{padding:10px 0;border-bottom:1px solid #e4e6ea}td:first-child{color:#5b6470;width:45%}
  .foot{margin-top:40px;font-size:12px;color:#5b6470}
  @media print{body{margin:0}}
</style></head><body>
<h1>${esc(agencyName)}</h1><p class="sub">Rent receipt</p>
<p class="no">Receipt ${esc(receiptNumber(payment.id))}</p>
<p class="amount">${esc(kes(payment.amount))}</p>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p class="foot">Thank you. This receipt confirms the payment above was received.</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}
