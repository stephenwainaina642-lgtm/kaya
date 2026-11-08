import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { LISTING_TYPES, PROPERTY_TYPES, type PropertyImportResult } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { systemDb } from '../../db/system';
import { organizations, owners, properties } from '../../db/schema';
import { parse } from '../../lib/validate';
import { recordAudit } from '../../lib/audit';
import { type Auth } from '../crm/common';
import { normalizePhone } from '../leads/import.service';
import { parseMoney } from '../rent/import.service';

export const PROPERTY_IMPORT_MAX_ROWS = 300;

const rawRow = z.object({
  title: z.string().optional(),
  reference: z.string().optional(),
  listingType: z.string().optional(),
  propertyType: z.string().optional(),
  price: z.string().optional(),
  location: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  ownerName: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().optional(),
});
const importInput = z.object({ rows: z.array(rawRow).min(1).max(PROPERTY_IMPORT_MAX_ROWS) });

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  const v = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

const count = (v: string | undefined): number | null | 'bad' => {
  if (!v?.trim()) return null;
  const n = Number(v.trim());
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : 'bad';
};

/**
 * Loads an agency's existing portfolio from a spreadsheet. Landlords are
 * matched by phone number and created when new, so the whole portfolio can
 * arrive in one file. A row whose reference (or title and location) is
 * already in Kaya is skipped, which makes re-running the same file safe.
 */
export async function importProperties(a: Auth, body: unknown): Promise<PropertyImportResult> {
  const { rows } = parse(importInput, body);
  const result: PropertyImportResult = { created: 0, ownersCreated: 0, duplicates: 0, invalid: [] };
  const [org] = await systemDb.select({ currency: organizations.currency }).from(organizations).where(eq(organizations.id, a.organizationId));
  const currency = org?.currency ?? 'KES';

  return withTenant(a.organizationId, async (tx) => {
    const existing = await tx.select({ reference: properties.reference, title: properties.title, location: properties.location }).from(properties);
    const refs = new Set(existing.map((p) => p.reference.toLowerCase()));
    const keys = new Set(existing.map((p) => `${p.title.trim().toLowerCase()}|${p.location.trim().toLowerCase()}`));

    const phones = rows.map((r) => normalizePhone(r.ownerPhone ?? '')).filter((p) => /^\+?\d{7,20}$/.test(p));
    const known = phones.length ? await tx.select({ id: owners.id, phone: owners.phone }).from(owners).where(inArray(owners.phone, phones)) : [];
    const ownerByPhone = new Map(known.map((o) => [o.phone, o.id]));

    const toInsert: (typeof properties.$inferInsert)[] = [];
    for (const [i, r] of rows.entries()) {
      const line = i + 1;
      const bad = (reason: string) => void result.invalid.push({ row: line, reason });

      const title = (r.title ?? '').trim();
      const location = (r.location ?? '').trim();
      if (!title) { bad('Missing property name'); continue; }
      if (title.length > 200) { bad('Property name too long'); continue; }
      if (!location) { bad('Missing location'); continue; }
      const listingType = pick(r.listingType, LISTING_TYPES) ?? (r.listingType?.trim() ? null : 'RENT');
      if (!listingType) { bad('Listing must be SALE or RENT'); continue; }
      const propertyType = pick(r.propertyType, PROPERTY_TYPES) ?? (r.propertyType?.trim() ? null : 'APARTMENT');
      if (!propertyType) { bad(`Type must be one of ${PROPERTY_TYPES.join(', ').toLowerCase()}`); continue; }
      const price = parseMoney(r.price);
      if (price === null) { bad('Missing or invalid price'); continue; }
      const bedrooms = count(r.bedrooms);
      const bathrooms = count(r.bathrooms);
      if (bedrooms === 'bad' || bathrooms === 'bad') { bad('Bedrooms and bathrooms must be whole numbers'); continue; }

      const phone = normalizePhone(r.ownerPhone ?? '');
      const ownerName = (r.ownerName ?? '').trim();
      if (!/^\+?\d{7,20}$/.test(phone)) { bad('Missing or invalid landlord phone'); continue; }
      const email = (r.ownerEmail ?? '').trim();
      if (email && !z.string().email().safeParse(email).success) { bad('Invalid landlord email'); continue; }
      if (!ownerByPhone.has(phone) && !ownerName) { bad('Landlord is new, so their name is needed'); continue; }

      const key = `${title.toLowerCase()}|${location.toLowerCase()}`;
      const given = r.reference?.trim();
      if (keys.has(key) || (given && refs.has(given.toLowerCase()))) { result.duplicates++; continue; }
      let reference = given;
      if (!reference) {
        do reference = `IMP-${randomBytes(3).toString('hex').toUpperCase()}`; while (refs.has(reference.toLowerCase()));
      }
      if (reference.length > 40) { bad('Reference too long'); continue; }
      keys.add(key);
      refs.add(reference.toLowerCase());

      let ownerId = ownerByPhone.get(phone);
      if (!ownerId) {
        const [o] = await tx.insert(owners).values({
          organizationId: a.organizationId, fullName: ownerName, phone, email: email || null, createdById: a.userId, updatedById: a.userId,
        }).returning({ id: owners.id });
        ownerId = o!.id;
        ownerByPhone.set(phone, ownerId);
        result.ownersCreated++;
      }
      toInsert.push({
        organizationId: a.organizationId, reference, title, listingType, propertyType, price, currency, location,
        neighborhood: r.neighborhood?.trim() || null, city: r.city?.trim() || 'Nairobi', bedrooms, bathrooms, ownerId,
        assignedAgentId: a.userId, listedAt: new Date(), createdById: a.userId, updatedById: a.userId,
      });
    }

    if (toInsert.length) await tx.insert(properties).values(toInsert);
    result.created = toInsert.length;
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'property', entityId: a.organizationId,
      summary: `Imported ${toInsert.length} properties from CSV (${result.duplicates} duplicates, ${result.invalid.length} invalid)`,
    });
    return result;
  });
}
