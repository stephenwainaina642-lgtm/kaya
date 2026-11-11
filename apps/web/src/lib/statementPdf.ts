import { periodLabel, type OwnerStatement } from '@kaya/shared';
import { money } from './currency';

/**
 * Builds a landlord statement as an A4 PDF in the browser, so nothing is sent to a server.
 * jsPDF is loaded on demand: most people never open this and it should not weigh on the main bundle.
 */
export async function downloadStatementPdf(s: OwnerStatement, agencyName: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const right = W - M;
  let y = M;

  const ink: [number, number, number] = [15, 20, 25];
  const muted: [number, number, number] = [100, 108, 118];
  const line: [number, number, number] = [220, 224, 230];
  const text = (t: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(...(opts.color ?? ink));
    doc.text(t, x, yy, { align: opts.align ?? 'left' });
  };
  const rule = (yy: number) => { doc.setDrawColor(...line); doc.setLineWidth(0.6); doc.line(M, yy, right, yy); };
  const clip = (t: string, max: number) => (doc.splitTextToSize(t, max)[0] as string) ?? '';

  text(agencyName, M, y + 6, { size: 9, color: muted });
  text('Landlord statement', M, y + 30, { size: 20, bold: true });
  text(periodLabel(s.period), right, y + 30, { size: 12, align: 'right', color: muted });
  y += 52;
  text(`Prepared for ${s.ownerName}`, M, y, { size: 11 });
  text(`Issued ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, right, y, { size: 9, color: muted, align: 'right' });
  y += 20;
  rule(y);
  y += 26;

  // Headline numbers.
  const t = s.totals;
  const cards: [string, number][] = [['Rent collected', t.collected], ['Fee and tax', t.managementFee + t.withholding], ['Repairs', t.maintenance], ['Paid to you', t.netToLandlord]];
  const cw = (W - 2 * M) / cards.length;
  cards.forEach(([label, value], i) => {
    const x = M + i * cw;
    text(label.toUpperCase(), x, y, { size: 7.5, color: muted });
    text(money(value), x, y + 18, { size: 13, bold: true });
  });
  y += 46;

  // due and collected are the RIGHT edges of their columns.
  const cols = { property: M, tenant: M + 165, due: M + 330, collected: M + 415, net: right };
  const header = () => {
    text('PROPERTY', cols.property, y, { size: 7.5, color: muted });
    text('TENANT', cols.tenant, y, { size: 7.5, color: muted });
    text('RENT DUE', cols.due, y, { size: 7.5, color: muted, align: 'right' });
    text('COLLECTED', cols.collected, y, { size: 7.5, color: muted, align: 'right' });
    text('TO YOU', cols.net, y, { size: 7.5, color: muted, align: 'right' });
    rule(y + 8);
    y += 24;
  };
  const room = (need: number) => { if (y + need > H - 70) { doc.addPage(); y = M; header(); } };

  header();
  for (const l of s.lines) {
    room(20);
    text(clip(l.propertyTitle, 155), cols.property, y);
    text(clip(l.tenantName, 100), cols.tenant, y);
    text(money(l.rentDue), cols.due, y, { align: 'right' });
    text(money(l.collected), cols.collected, y, { align: 'right' });
    text(money(l.netToLandlord), cols.net, y, { align: 'right' });
    rule(y + 8);
    y += 22;
  }
  for (const d of s.deductions) {
    room(20);
    text(clip(`Repair: ${d.title} (${d.propertyTitle})`, 380), cols.property, y, { color: muted });
    text(`- ${money(d.amount)}`, cols.net, y, { align: 'right', color: muted });
    rule(y + 8);
    y += 22;
  }

  // Working, so the landlord can see exactly how the payout was reached.
  room(110);
  y += 14;
  const row = (label: string, value: string, bold = false) => {
    text(label, cols.due - 60, y, { bold, size: bold ? 11 : 10, color: bold ? ink : muted });
    text(value, cols.net, y, { bold, size: bold ? 11 : 10, align: 'right' });
    y += bold ? 22 : 18;
  };
  row('Rent collected', money(t.collected));
  row('Management fee', `- ${money(t.managementFee)}`);
  if (t.withholding > 0) row('Tax withheld', `- ${money(t.withholding)}`);
  if (t.maintenance > 0) row('Repairs recharged', `- ${money(t.maintenance)}`);
  rule(y - 8);
  y += 6;
  row('Paid to you', money(t.netToLandlord), true);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    text(`${agencyName} - Statement for ${periodLabel(s.period)}`, M, H - 30, { size: 8, color: muted });
    text(`Page ${i} of ${pages}`, right, H - 30, { size: 8, color: muted, align: 'right' });
  }
  const slug = s.ownerName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'landlord';
  doc.save(`statement-${slug}-${s.period}.pdf`);
}
