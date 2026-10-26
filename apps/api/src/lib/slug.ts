import { like } from 'drizzle-orm';
import { systemDb } from '../db/system';
import { organizations } from '../db/schema';

/**
 * Turns an agency name into a URL-safe, collision-free slug. Shared between
 * the platform-admin manual onboarding flow and the self-serve signup flow
 * — both create organizations the same way, just through different routes.
 */
export async function uniqueSlug(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agency';

  const existing = await systemDb
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(like(organizations.slug, `${base}%`));
  const taken = new Set(existing.map((o) => o.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
