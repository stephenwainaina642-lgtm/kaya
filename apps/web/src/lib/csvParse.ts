// Minimal RFC 4180 parser: quoted fields, escaped quotes, embedded commas and
// newlines, CRLF/LF, and a leading BOM (Excel adds one). Also accepts ; or tab
// delimiters, which regional Excel exports use.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string[]> = {
  fullName: ['fullname', 'name', 'full name', 'client', 'contact', 'customer'],
  phone: ['phone', 'phone number', 'mobile', 'tel', 'telephone', 'cell', 'contact number'],
  whatsapp: ['whatsapp', 'whatsapp number'],
  email: ['email', 'e-mail', 'email address'],
  source: ['source', 'lead source', 'channel'],
  temperature: ['temperature', 'temp', 'priority'],
  leadType: ['leadtype', 'lead type', 'type', 'looking to'],
  tags: ['tags', 'tag', 'labels'],
  notes: ['notes', 'note', 'comments', 'remarks'],
};

const PROPERTY_ALIASES: Record<string, string[]> = {
  title: ['property', 'property name', 'title', 'name', 'unit', 'house'],
  reference: ['reference', 'ref', 'code', 'property code'],
  listingType: ['listing', 'listing type', 'for', 'sale/rent', 'sale or rent'],
  propertyType: ['type', 'property type', 'category'],
  price: ['price', 'rent', 'monthly rent', 'asking price', 'amount'],
  location: ['location', 'area', 'address'],
  neighborhood: ['neighborhood', 'neighbourhood', 'estate'],
  city: ['city', 'town'],
  bedrooms: ['bedrooms', 'beds', 'bedroom', 'br'],
  bathrooms: ['bathrooms', 'baths', 'bathroom'],
  ownerName: ['landlord', 'landlord name', 'owner', 'owner name'],
  ownerPhone: ['landlord phone', 'owner phone', 'landlord mobile', 'owner mobile', 'landlord number'],
  ownerEmail: ['landlord email', 'owner email'],
};

export const PROPERTY_IMPORT_TEMPLATE =
  'property,listing,type,price,location,neighborhood,city,bedrooms,bathrooms,landlord,landlord phone,landlord email\r\nKilimani 2BR,RENT,APARTMENT,85000,Kilimani,Kilimani,Nairobi,2,2,Grace Wanjiru,0711 000 001,grace@example.com\r\n';

export { LEASE_ALIASES, PROPERTY_ALIASES };
export const IMPORT_TEMPLATE =
  'name,phone,email,source,temperature,type,tags,notes\r\nAmina Yusuf,0722 000 000,amina@example.com,WHATSAPP,HOT,BUYER,vip;kilimani,Wants a 3BR in Kilimani\r\n';

const LEASE_ALIASES: Record<string, string[]> = {
  property: ['property', 'property name', 'unit', 'house', 'apartment', 'title'],
  tenantName: ['tenant', 'tenant name', 'name', 'full name', 'fullname'],
  tenantPhone: ['tenant phone', 'phone', 'phone number', 'mobile', 'tel', 'telephone', 'tenant mobile'],
  tenantEmail: ['tenant email', 'email', 'e-mail', 'email address'],
  rent: ['rent', 'monthly rent', 'rent amount', 'amount'],
  deposit: ['deposit', 'security deposit', 'deposit amount'],
  dueDay: ['due day', 'dueday', 'rent due day', 'due'],
  startDate: ['start', 'start date', 'lease start', 'move in', 'move-in', 'since'],
  endDate: ['end', 'end date', 'lease end', 'expiry', 'expires'],
  feePercent: ['fee', 'fee %', 'management fee', 'commission', 'commission %', 'fee percent'],
};

export const LEASE_IMPORT_TEMPLATE =
  'property,tenant name,tenant phone,tenant email,rent,deposit,due day,start date,end date,fee %\r\nKilimani 2BR,Amina Yusuf,0722 000 000,amina@example.com,85000,170000,5,01/01/2026,31/12/2026,10\r\n';

// Maps whatever headers the agent's spreadsheet uses onto Kaya's fields.
export function rowsFromCsv(text: string, aliases: Record<string, string[]> = ALIASES): Record<string, string>[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const map = header.map((h) => {
    const k = h.trim().toLowerCase();
    return Object.keys(aliases).find((field) => aliases[field]!.includes(k)) ?? null;
  });
  return body.map((cells) => {
    const out: Record<string, string> = {};
    cells.forEach((c, i) => { const f = map[i]; if (f && c.trim()) out[f] = c.trim(); });
    return out;
  });
}
