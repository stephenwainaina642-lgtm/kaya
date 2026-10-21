import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { LEAD_TYPES } from '@kaya/shared';
import type { PublicOrgInfo, InquiryLink } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { withTenant } from '../../db/client';
import { organizations, leads, properties, activities } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth } from '../crm/common';
import { findDuplicate } from '../crm/duplicates';
import { enrollLeadInMatchingSequences } from '../automation/drip.service';
import { applyAutoAssignRule } from '../automation/rules.service';
import { recordAudit } from '../../lib/audit';

export const publicInquiryInput = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(30),
  email: z.string().email().nullable().optional(),
  leadType: z.enum(LEAD_TYPES).default('BUYER'),
  message: z.string().trim().max(2000).nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  // Honeypot — a hidden field no real visitor fills in. Non-empty means a
  // bot; we accept the request (so the bot doesn't learn to avoid us) but
  // quietly skip creating anything from it.
  website: z.string().max(200).optional(),
});

async function resolveOrgBySlug(slug: string) {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org || org.suspendedAt) throw notFound('Agency');
  return org;
}

export async function getPublicOrgInfo(slug: string): Promise<PublicOrgInfo> {
  const org = await resolveOrgBySlug(slug);
  return { name: org.name };
}

/**
 * The public, unauthenticated "contact this agency" form — the CRM
 * equivalent of lead routing from an agency's own website, since Kaya has
 * no real IDX/Zillow-style feed to pull from. Submissions become a real
 * lead, run through the same auto-assignment rules and drip sequences as
 * any lead created inside the app, with source=WEBSITE by default.
 *
 * A phone number that already matches an existing lead or client in this
 * org does NOT create a duplicate — it logs the new inquiry as an activity
 * against the existing record instead, same as a repeat enquiry would be
 * handled by a human. Either way the visitor sees the same generic
 * "we'll be in touch" response, so the form never reveals whether a given
 * phone number is already a contact.
 */
export async function submitPublicInquiry(slug: string, body: unknown, ip: string | null): Promise<void> {
  const input = parse(publicInquiryInput, body);
  if (input.website) return; // honeypot tripped — silently no-op
  const org = await resolveOrgBySlug(slug);

  await withTenant(org.id, async (tx) => {
    const dup = await findDuplicate(tx, org.id, input.phone);
    const note = input.message?.trim() || null;
    const title = 'New inquiry from the public contact form';

    if (dup) {
      await tx.insert(activities).values({
        organizationId: org.id,
        type: 'NOTE',
        title,
        body: note,
        actorId: null,
        leadId: dup.kind === 'lead' ? dup.id : null,
        clientId: dup.kind === 'client' ? dup.id : null,
        metadata: { source: 'public_inquiry', ip },
      });
      return;
    }

    let propertyNote = note;
    if (input.propertyId) {
      const [prop] = await tx.select({ title: properties.title }).from(properties).where(eq(properties.id, input.propertyId));
      if (prop) {
        propertyNote = `Asked about: ${prop.title}${note ? ` — ${note}` : ''}`;
      }
    }

    const assignedAgentId = await applyAutoAssignRule(tx, org.id, 'WEBSITE');

    const [row] = await tx.insert(leads).values({
      organizationId: org.id,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      source: 'WEBSITE',
      leadType: input.leadType,
      notes: propertyNote,
      assignedAgentId,
      createdById: null,
      updatedById: null,
    }).returning();
    if (!row) return;

    await enrollLeadInMatchingSequences(tx, org.id, row.id, 'WEBSITE');
    await recordAudit(tx, {
      organizationId: org.id, actorId: null, action: 'CREATE', entityType: 'lead', entityId: row.id,
      summary: `New lead from public inquiry form: ${row.fullName}`,
    });
  });
}

export async function getMyInquiryLink(a: Auth): Promise<InquiryLink> {
  const [org] = await systemDb.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, a.organizationId));
  if (!org) throw notFound('Organization');
  return { slug: org.slug };
}
