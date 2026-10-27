/**
 * An agency's identity wherever Kaya shows a logo mark — the app sidebar,
 * and the public inquiry/shortlist pages a client opens with no login.
 * Falls back to Kaya's own "K" mark and cypress green when the agency
 * hasn't set a logo/brand color, so branding is additive, never required.
 */
export function BrandMark({
  logoUrl, name, brandColor, size = 32,
}: { logoUrl?: string | null; name: string; brandColor?: string | null; size?: number }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        style={{ height: size, width: size }}
        className="rounded-control object-contain"
      />
    );
  }
  const initial = (name || 'K').trim().charAt(0).toUpperCase() || 'K';
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-control font-display font-semibold text-white ${brandColor ? '' : 'bg-cypress-600'}`}
      style={{ height: size, width: size, fontSize: size * 0.42, backgroundColor: brandColor || undefined }}
    >
      {initial}
    </div>
  );
}
