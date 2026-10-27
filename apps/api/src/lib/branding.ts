/**
 * organizations.logo_url holds an internal storage key (see lib/storage.ts),
 * never a path a browser can fetch directly. Every place that hands a logo
 * to the outside world — auth responses, the org-settings branding
 * endpoint, the public logo-serving route — must go through this to turn
 * that key into the actual servable URL, or the frontend ends up trying to
 * render an <img> with an internal file-storage path as its src.
 */
export function toPublicLogoUrl(slug: string, logoStorageKey: string | null): string | null {
  return logoStorageKey ? `/api/public/organizations/${slug}/logo` : null;
}
