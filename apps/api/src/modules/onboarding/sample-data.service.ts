import { and, eq, like, sql as dsql } from 'drizzle-orm';
import type { SampleDataStatus } from '@kaya/shared';
import { withTenant } from '../../db/client';
import { leads, owners, properties } from '../../db/schema';
import { conflict } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { type Auth } from '../crm/common';

// Sample records are recognisable without any schema change: leads carry the
// 'sample' tag, owners a fixed note, properties an SMP- reference. Real work
// never gets these markers, so removal can't touch an agency's own data.
export const SAMPLE_TAG = 'sample';
export const SAMPLE_OWNER_NOTE = '[sample data]';
export const SAMPLE_REF_PREFIX = 'SMP-';

export const isSampleLead = dsql`${SAMPLE_TAG} = ANY(${leads.tags})`;
export const isSampleProperty = like(properties.reference, `${SAMPLE_REF_PREFIX}%`);

const OWNERS = [
  { fullName: 'Grace Wanjiru', phone: '+254700100001', notes: SAMPLE_OWNER_NOTE },
  { fullName: 'Hassan Mwinyi', phone: '+254700100002', notes: SAMPLE_OWNER_NOTE },
];

const PROPERTIES = [
  { n: 1, title: '3 Bedroom Apartment, Kilimani', listingType: 'RENT', propertyType: 'APARTMENT', price: 145000, location: 'Kilimani', bedrooms: 3, bathrooms: 3, sizeSqm: 165, parkingSpaces: 2, furnishing: 'SEMI_FURNISHED', o: 0 },
  { n: 2, title: '4 Bedroom Maisonette, Lavington', listingType: 'SALE', propertyType: 'MAISONETTE', price: 48500000, location: 'Lavington', bedrooms: 4, bathrooms: 4, sizeSqm: 320, parkingSpaces: 3, furnishing: 'UNFURNISHED', o: 0 },
  { n: 3, title: '2 Bedroom Apartment, Westlands', listingType: 'RENT', propertyType: 'APARTMENT', price: 95000, location: 'Westlands', bedrooms: 2, bathrooms: 2, sizeSqm: 110, parkingSpaces: 1, furnishing: 'FURNISHED', o: 1 },
  { n: 4, title: 'Prime Office Suite, Upper Hill', listingType: 'RENT', propertyType: 'OFFICE', price: 280000, location: 'Upper Hill', bedrooms: null, bathrooms: 2, sizeSqm: 240, parkingSpaces: 6, furnishing: 'UNFURNISHED', o: 1, segment: 'COMMERCIAL' },
  { n: 5, title: '5 Bedroom Villa, Karen', listingType: 'SALE', propertyType: 'VILLA', price: 125000000, location: 'Karen', bedrooms: 5, bathrooms: 6, sizeSqm: 650, parkingSpaces: 4, furnishing: 'UNFURNISHED', o: 0 },
] as const;

const LEADS = [
  ['Amina Yusuf', '+254700200001', 'WHATSAPP', 'HOT', 'Looking for a 3BR to rent in Kilimani, budget around 150k.'],
  ['Brian Otieno', '+254700200002', 'WEBSITE', 'WARM', 'Wants to buy a maisonette in Lavington or Kileleshwa.'],
  ['Cynthia Njeri', '+254700200003', 'REFERRAL', 'HOT', 'Relocating from Mombasa; needs a furnished 2BR by month end.'],
  ['David Kimani', '+254700200004', 'SOCIAL_MEDIA', 'COLD', 'Browsing villas in Karen, no timeline yet.'],
  ['Esther Achieng', '+254700200005', 'WALK_IN', 'WARM', 'Small business owner, needs an office near Upper Hill.'],
  ['Farouk Abdalla', '+254700200006', 'WHATSAPP', 'WARM', 'Investor interested in rental apartments in Westlands.'],
] as const;

export async function getSampleStatus(a: Auth): Promise<SampleDataStatus> {
  return withTenant(a.organizationId, async (tx) => {
    const [row] = await tx.select({ c: dsql<number>`count(*)::int` }).from(leads).where(isSampleLead);
    return { loaded: (row?.c ?? 0) > 0 };
  });
}

export async function loadSampleData(a: Auth): Promise<SampleDataStatus> {
  await withTenant(a.organizationId, async (tx) => {
    const [existing] = await tx.select({ c: dsql<number>`count(*)::int` }).from(leads).where(isSampleLead);
    if ((existing?.c ?? 0) > 0) throw conflict('Sample data is already loaded.', 'SAMPLE_DATA_LOADED');

    const ownerRows = await tx.insert(owners).values(
      OWNERS.map((o) => ({ ...o, organizationId: a.organizationId, createdById: a.userId, updatedById: a.userId })),
    ).returning({ id: owners.id });

    await tx.insert(properties).values(PROPERTIES.map((p) => ({
      organizationId: a.organizationId,
      reference: `${SAMPLE_REF_PREFIX}${String(p.n).padStart(3, '0')}`,
      title: p.title,
      listingType: p.listingType,
      propertyType: p.propertyType,
      segment: ('segment' in p ? p.segment : 'RESIDENTIAL') as 'RESIDENTIAL' | 'COMMERCIAL',
      price: p.price,
      location: p.location,
      city: 'Nairobi',
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      sizeSqm: p.sizeSqm,
      parkingSpaces: p.parkingSpaces,
      furnishing: p.furnishing,
      status: 'AVAILABLE' as const,
      description: 'Sample listing so you can explore Kaya. Remove all sample data any time from the dashboard.',
      ownerId: ownerRows[p.o]!.id,
      assignedAgentId: a.userId,
      listedAt: new Date(),
      createdById: a.userId,
      updatedById: a.userId,
    })));

    await tx.insert(leads).values(LEADS.map(([fullName, phone, source, temperature, notes]) => ({
      organizationId: a.organizationId,
      fullName, phone, source, temperature, notes,
      tags: [SAMPLE_TAG],
      assignedAgentId: a.userId,
      createdById: a.userId,
      updatedById: a.userId,
    })));

    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'CREATE', entityType: 'sample_data', entityId: a.organizationId,
      summary: 'Loaded sample data',
    });
  });
  return { loaded: true };
}

export async function removeSampleData(a: Auth): Promise<SampleDataStatus> {
  await withTenant(a.organizationId, async (tx) => {
    try {
      await tx.delete(leads).where(isSampleLead);
      await tx.delete(properties).where(isSampleProperty);
      await tx.delete(owners).where(and(eq(owners.notes, SAMPLE_OWNER_NOTE)));
    } catch {
      throw conflict(
        'Some sample records are used by your own work (for example a viewing or deal on a sample property). Remove those first, then try again.',
        'SAMPLE_DATA_IN_USE',
      );
    }
    await recordAudit(tx, {
      organizationId: a.organizationId, actorId: a.userId, action: 'DELETE', entityType: 'sample_data', entityId: a.organizationId,
      summary: 'Removed sample data',
    });
  });
  return { loaded: false };
}
