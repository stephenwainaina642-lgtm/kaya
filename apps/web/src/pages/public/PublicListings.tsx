import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BedDouble, Bath, MapPin, MessageCircle, ArrowLeft, Building2 } from 'lucide-react';
import type { PublicListings as Listings, PublicListingDetail } from '@kaya/shared';
import { formatMoney, whatsappLink } from '@kaya/shared';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { BrandMark } from '../../components/BrandMark';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

function useTitle(t: string | undefined) {
  useEffect(() => { if (t) document.title = t; }, [t]);
}

function Missing() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t('listings.missingTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('listings.missingBody')}</p>
      </div>
    </div>
  );
}

function Header({ agency, back }: { agency: Listings['agency']; back?: string }) {
  const { t } = useTranslation();
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link to={`/listings/${agency.slug}`} className="flex items-center gap-3">
          <BrandMark logoUrl={agency.logoUrl} name={agency.name} brandColor={agency.brandColor} size={36} />
          <span className="text-base font-semibold text-ink">{agency.name}</span>
        </Link>
        <div className="flex items-center gap-3">
        <LanguageSwitcher />
        {back ? (
          <Link to={back} className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={15} /> {t('listings.allListings')}</Link>
        ) : (
          <Link to={`/inquire/${agency.slug}`} className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black">{t('listings.contact')}</Link>
        )}
        </div>
      </div>
    </header>
  );
}


export function PublicListings() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [filter, setFilter] = useState<'ALL' | 'RENT' | 'SALE'>('ALL');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-listings', slug], queryFn: () => api.get<Listings>(`/public/listings/${slug}`), retry: false,
  });
  useTitle(data ? data.agency.name : undefined);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;
  if (isError || !data) return <Missing />;
  const items = data.items.filter((i) => filter === 'ALL' || i.listingType === filter);

  return (
    <div className="min-h-screen bg-ground">
      <Header agency={data.agency} />
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t('listings.heroTitle', { agency: data.agency.name })}</h1>
          <p className="mt-3 max-w-xl text-muted">{t('listings.count', { count: data.items.length })} {t('listings.heroBody')}</p>
          <div className="mt-6 inline-flex rounded-control border border-line p-0.5" role="tablist">
            {([['ALL', t('listings.all')], ['RENT', t('listings.rent')], ['SALE', t('listings.sale')]] as const).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
                className={`rounded-[5px] px-4 py-1.5 text-sm ${filter === v ? 'bg-ink font-medium text-white' : 'text-muted hover:text-ink'}`}>{l}</button>
            ))}
          </div>
        </div>
      </section>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        {items.length === 0 ? (
          <p className="py-16 text-center text-muted">{t('listings.empty')}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <Link key={p.id} to={`/listings/${data.agency.slug}/${p.id}`} className="group overflow-hidden rounded-panel border border-line bg-white shadow-card transition-shadow hover:shadow-lift">
                <div className="flex h-48 items-center justify-center bg-sunk text-faint">
                  {p.coverImageUrl ? <img src={p.coverImageUrl} alt={p.title} loading="lazy" className="h-full w-full object-cover" /> : <Building2 size={32} strokeWidth={1.25} />}
                </div>
                <div className="p-5">
                  <p className="text-xl font-semibold tabular-nums text-ink">{formatMoney(p.price, p.currency)}<span className="text-sm font-normal text-muted">{p.listingType === 'RENT' ? t('listings.perMonth') : ''}</span></p>
                  <h2 className="mt-1 truncate text-[0.9375rem] font-medium text-ink group-hover:underline">{p.title}</h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={13} /> {p.location}, {p.city}</p>
                  <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-sm text-muted">
                    <span>{t(`listings.types.${p.propertyType}`, { defaultValue: p.propertyType.charAt(0) + p.propertyType.slice(1).toLowerCase() })}</span>
                    {p.bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={14} /> {p.bedrooms}</span>}
                    {p.bathrooms != null && <span className="flex items-center gap-1"><Bath size={14} /> {p.bathrooms}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <footer className="border-t border-line bg-white py-6 text-center text-xs text-faint">{t('listings.footer', { agency: data.agency.name })}</footer>
    </div>
  );
}

export function PublicListing() {
  const { t } = useTranslation();
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const [active, setActive] = useState(0);
  const { data: p, isLoading, isError } = useQuery({
    queryKey: ['public-listing', slug, id], queryFn: () => api.get<PublicListingDetail>(`/public/listings/${slug}/${id}`), retry: false,
  });
  useTitle(p ? `${p.title}: ${p.agency.name}` : undefined);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;
  if (isError || !p) return <Missing />;
  const photos = p.images.length ? p.images : p.coverImageUrl ? [{ url: p.coverImageUrl, alt: p.title }] : [];
  const price = `${formatMoney(p.price, p.currency)}${p.listingType === 'RENT' ? t('listings.perMonthLong') : ''}`;
  const msg = t('listings.wa', { agency: p.agency.name, title: p.title, price, url: window.location.href });

  return (
    <div className="min-h-screen bg-ground">
      <Header agency={p.agency} back={`/listings/${p.agency.slug}`} />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="overflow-hidden rounded-panel border border-line bg-white">
            <div className="flex h-72 items-center justify-center bg-sunk text-faint sm:h-96">
              {photos[active] ? <img src={photos[active]!.url} alt={photos[active]!.alt ?? p.title} className="h-full w-full object-cover" /> : <Building2 size={40} strokeWidth={1.25} />}
            </div>
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {photos.map((ph, i) => (
                  <button key={ph.url} type="button" onClick={() => setActive(i)} aria-label={t('listings.photo', { n: i + 1 })}
                    className={`h-16 w-20 shrink-0 overflow-hidden rounded-control ring-2 ${i === active ? 'ring-ink' : 'ring-transparent'}`}>
                    <img src={ph.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <section className="rounded-panel border border-line bg-white p-6">
            <h2 className="text-lg font-semibold text-ink">{t('listings.about')}</h2>
            <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-muted">{p.description ?? t('listings.noDescription')}</p>
            {p.features.length > 0 && (
              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-ink sm:grid-cols-3">
                {p.features.map((f) => <li key={f.label} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ink" />{f.label}</li>)}
              </ul>
            )}
          </section>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-panel border border-line bg-white p-6 shadow-card">
            <p className="text-2xl font-semibold tabular-nums text-ink">{formatMoney(p.price, p.currency)}<span className="text-sm font-normal text-muted">{p.listingType === 'RENT' ? t('listings.perMonth') : ''}</span></p>
            <h1 className="mt-1 text-[1.0625rem] font-medium text-ink">{p.title}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {p.location}, {p.city}</p>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
              <div><dt className="text-faint">{t('listings.bedrooms')}</dt><dd className="font-medium text-ink">{p.bedrooms ?? '–'}</dd></div>
              <div><dt className="text-faint">{t('listings.bathrooms')}</dt><dd className="font-medium text-ink">{p.bathrooms ?? '–'}</dd></div>
              <div><dt className="text-faint">{t('listings.size')}</dt><dd className="font-medium text-ink">{p.sizeSqm ? `${p.sizeSqm} m²` : '–'}</dd></div>
            </dl>
            {p.availableFrom && <p className="mt-3 text-sm text-muted">{t('listings.availableFrom', { date: p.availableFrom })}</p>}
            <div className="mt-5 space-y-2">
              <Link to={`/inquire/${p.agency.slug}?property=${p.id}`} className="block rounded-control bg-ink px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-black">{t('listings.viewing')}</Link>
              {p.agency.phone && (
                <a href={whatsappLink(p.agency.phone, msg)} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-control border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-sunk">
                  <MessageCircle size={15} /> {t('listings.whatsapp', { name: p.agent?.name ?? t('listings.us') })}
                </a>
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
