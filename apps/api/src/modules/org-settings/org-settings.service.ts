import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { OrgBranding } from '@kaya/shared';
import { systemDb } from '../../db/system';
import { organizations } from '../../db/schema';
import { notFound, invalid } from '../../lib/errors';
import { parse } from '../../lib/validate';
import { type Auth } from '../crm/common';
import { saveFile, deleteFile } from '../../lib/storage';
import { toPublicLogoUrl } from '../../lib/branding';

export async function getBranding(a: Auth): Promise<OrgBranding> {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, a.organizationId));
  if (!org) throw notFound('Organization');
  return { name: org.name, logoUrl: toPublicLogoUrl(org.slug, org.logoUrl), brandColor: org.brandColor };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const updateBrandingInput = z.object({
  // null clears it (back to Kaya's default palette); omit to leave unchanged.
  brandColor: z.string().regex(HEX_COLOR, 'Must be a hex color like #2F5D4E').nullable().optional(),
});

export async function updateBranding(a: Auth, body: unknown): Promise<OrgBranding> {
  const input = parse(updateBrandingInput, body);
  if (input.brandColor !== undefined) {
    await systemDb
      .update(organizations)
      .set({ brandColor: input.brandColor })
      .where(eq(organizations.id, a.organizationId));
  }
  return getBranding(a);
}

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

export async function uploadLogo(a: Auth, file: Express.Multer.File | undefined): Promise<OrgBranding> {
  if (!file) throw invalid({ file: 'A logo image is required' });
  if (!ALLOWED_LOGO_TYPES.has(file.mimetype)) {
    throw invalid({ file: 'Logo must be a PNG, JPEG, WebP, or SVG image' });
  }

  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, a.organizationId));
  if (!org) throw notFound('Organization');

  const storageKey = await saveFile(a.organizationId, file.buffer);
  if (org.logoUrl) await deleteFile(org.logoUrl).catch(() => undefined);

  await systemDb.update(organizations).set({ logoUrl: storageKey }).where(eq(organizations.id, a.organizationId));
  return getBranding(a);
}

export async function removeLogo(a: Auth): Promise<OrgBranding> {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.id, a.organizationId));
  if (!org) throw notFound('Organization');
  if (org.logoUrl) await deleteFile(org.logoUrl).catch(() => undefined);
  await systemDb.update(organizations).set({ logoUrl: null }).where(eq(organizations.id, a.organizationId));
  return getBranding(a);
}

/** Looked up by slug for the public logo-serving route — same resolution
 * rule as the public inquiry page: a suspended agency's branding doesn't
 * leak either. Returns the raw storage key, not the public URL (there'd be
 * nothing to compute it from a second time). */
export async function getLogoStorageKeyBySlug(slug: string): Promise<string | null> {
  const [org] = await systemDb.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org || org.suspendedAt) throw notFound('Agency');
  return org.logoUrl;
}
