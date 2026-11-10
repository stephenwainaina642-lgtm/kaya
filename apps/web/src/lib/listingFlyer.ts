import QRCode from 'qrcode';
import type { PublicListingDetail } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { api } from './api';

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u: string) => (/^(https?:|\/)/i.test(u) ? esc(u) : '');

/** Opens a print-ready A4 flyer (photo, price, details, QR code to the public listing). Everything is escaped. */
export async function printListingFlyer(slug: string, id: string): Promise<void> {
  const w = window.open('', '_blank'); // open synchronously so popup blockers allow it
  if (!w) throw new Error('Please allow pop-ups to print the flyer.');
  w.document.write('<p style="font-family:sans-serif;padding:24px">Preparing flyer…</p>');
  try {
    const p = await api.get<PublicListingDetail>(`/public/listings/${slug}/${id}`);
    const url = `${window.location.origin}/listings/${slug}/${id}`;
    const qr = await QRCode.toString(url, { type: 'svg', margin: 0, width: 140 });
    const photos = (p.images.length ? p.images : p.coverImageUrl ? [{ url: p.coverImageUrl }] : []).slice(0, 3);
    const price = formatMoney(p.price, p.currency) + (p.listingType === 'RENT' ? ' per month' : '');
    const facts = [
      p.bedrooms != null ? `${p.bedrooms} bed` : '', p.bathrooms != null ? `${p.bathrooms} bath` : '',
      p.sizeSqm ? `${p.sizeSqm} m²` : '', p.parkingSpaces ? `${p.parkingSpaces} parking` : '',
    ].filter(Boolean);
    const accent = /^#[0-9a-f]{6}$/i.test(p.agency.brandColor ?? '') ? p.agency.brandColor! : '#0f1419';
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title)}</title>
<style>
  @page{size:A4;margin:0}
  *{box-sizing:border-box}body{margin:0;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#0f1419}
  .page{width:210mm;min-height:297mm;display:flex;flex-direction:column}
  .top{background:${accent};color:#fff;padding:12mm 14mm;display:flex;justify-content:space-between;align-items:center}
  .top b{font-size:18px}.tag{font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85}
  .hero{height:110mm;background:#eceef1;overflow:hidden}.hero img{width:100%;height:100%;object-fit:cover}
  .strip{display:flex;gap:2mm;padding:2mm 14mm 0}.strip img{flex:1;height:30mm;object-fit:cover;min-width:0}
  .body{padding:10mm 14mm;flex:1}
  h1{font-size:30px;margin:0 0 4px;letter-spacing:-.01em}.loc{color:#5b6470;font-size:15px;margin:0 0 6mm}
  .price{font-size:34px;font-weight:600;margin:0 0 5mm}
  .facts{display:flex;gap:8mm;border-top:1px solid #e4e6ea;border-bottom:1px solid #e4e6ea;padding:4mm 0;font-size:15px;margin-bottom:6mm}
  .desc{font-size:13.5px;line-height:1.55;color:#3a424c;white-space:pre-line;max-height:48mm;overflow:hidden}
  .feat{margin-top:5mm;font-size:13px;color:#3a424c}
  .foot{display:flex;justify-content:space-between;align-items:center;padding:8mm 14mm;border-top:1px solid #e4e6ea}
  .foot p{margin:0;font-size:12px;color:#5b6470}.foot .cta{font-size:17px;font-weight:600;color:#0f1419;margin-bottom:2mm}
  .qr{width:34mm;text-align:center}.qr svg{width:34mm;height:34mm}
  @media screen{body{background:#f4f5f7}.page{margin:0 auto;background:#fff}}
</style></head><body><div class="page">
  <div class="top"><b>${esc(p.agency.name)}</b><span class="tag">${p.listingType === 'RENT' ? 'To let' : 'For sale'}</span></div>
  <div class="hero">${photos[0] ? `<img src="${safeUrl(photos[0].url)}" alt="">` : ''}</div>
  ${photos.length > 1 ? `<div class="strip">${photos.slice(1).map((ph) => `<img src="${safeUrl(ph.url)}" alt="">`).join('')}</div>` : ''}
  <div class="body">
    <h1>${esc(p.title)}</h1><p class="loc">${esc(p.location)}, ${esc(p.city)}</p>
    <p class="price">${esc(price)}</p>
    ${facts.length ? `<div class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
    ${p.description ? `<div class="desc">${esc(p.description)}</div>` : ''}
    ${p.features.length ? `<p class="feat">${p.features.slice(0, 10).map((f) => esc(f.label)).join(' · ')}</p>` : ''}
  </div>
  <div class="foot">
    <div><p class="cta">Book a viewing today</p><p>${p.agency.phone ? `Call or WhatsApp ${esc(p.agency.phone)}<br>` : ''}Scan the code to see all photos<br>and request a viewing</p></div>
    <div class="qr">${qr}</div>
  </div>
</div><script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body></html>`);
    w.document.close();
  } catch (err) {
    w.close();
    throw err;
  }
}
