import { periodLabel, type TenantStatement } from '@kaya/shared';
import { money as kes } from '../lib/currency';

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Opens a print-ready statement of account for one tenant. */
export function printTenantStatement(agencyName: string, st: TenantStatement): void {
  const rows = st.rows.map((r) => `<tr>
<td>${esc(periodLabel(r.period))}${r.extras.length ? `<br><small>incl. ${esc(r.extras.map((x) => `${x.label} ${kes(x.amount)}`).join(', '))}</small>` : ''}</td>
<td class="n">${esc(kes(r.charged))}</td>
<td class="n">${esc(kes(r.paid))}${r.payments.length ? `<br><small>${esc(r.payments.map((p) => `${new Date(p.paidAt).toLocaleDateString('en-KE')} ${p.method === 'MPESA' ? 'M-Pesa' : p.method.toLowerCase()}${p.reference ? ' ' + p.reference : ''}`).join('; '))}</small>` : ''}</td>
<td class="n">${esc(kes(r.balance))}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Statement - ${esc(st.tenantName)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1c2b24;max-width:720px;margin:40px auto;padding:0 24px}
  h1{font-size:22px;margin:0}.sub{color:#5b6b63;font-size:13px;margin:4px 0 24px}
  table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b63;border-bottom:2px solid #1c2b24;padding:8px 0}
  td{padding:9px 0;border-bottom:1px solid #dfe5e1;vertical-align:top}.n{text-align:right}th.n{text-align:right}small{color:#5b6b63}
  tfoot td{font-weight:bold;border-top:2px solid #1c2b24;border-bottom:none}
  .foot{margin-top:32px;font-size:12px;color:#5b6b63}@media print{body{margin:0}}
</style></head><body>
<h1>${esc(agencyName)}</h1><p class="sub">Statement of account · ${esc(st.tenantName)} · ${esc(st.propertyTitle)} · ${esc(new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
<table><thead><tr><th>Month</th><th class="n">Charged</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td>Total</td><td class="n">${esc(kes(st.totals.charged))}</td><td class="n">${esc(kes(st.totals.paid))}</td><td class="n">${esc(kes(st.totals.balance))}</td></tr></tfoot></table>
<p class="foot">${st.totals.balance > 0 ? `Amount outstanding: ${esc(kes(st.totals.balance))}.` : 'Nothing is outstanding on this account.'}</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
