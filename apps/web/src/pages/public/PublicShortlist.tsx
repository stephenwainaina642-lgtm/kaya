import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, Bath } from 'lucide-react';
import type { PublicShortlist as PublicShortlistT } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';

export function PublicShortlist() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-shortlist', token],
    queryFn: () => api.get<PublicShortlistT>(`/public/shortlists/${token}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold text-ink">Link not found</h1>
          <p className="mt-2 text-sm text-muted">This shortlist link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-white px-6 py-8 text-center sm:px-10">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{data.agencyName}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">{data.title}</h1>
        <p className="mt-1 text-sm text-muted">{data.items.length} {data.items.length === 1 ? 'property' : 'properties'} selected for you</p>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {data.items.length === 0 ? (
          <p className="text-center text-sm text-muted">No properties in this shortlist yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map(({ property, note }, i) => (
              <div key={i} className="overflow-hidden rounded-panel border border-line bg-white shadow-card">
                <div className="flex h-44 items-center justify-center bg-ground text-faint">
                  {property.images[0] ? (
                    <img src={property.images[0].url} alt={property.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs">No image</span>
                  )}
                </div>
                <div className="p-4">
                  <p className="mb-1 line-clamp-1 font-medium text-ink">{property.title}</p>
                  <p className="mb-2 text-xs text-muted">{property.location}</p>
                  <p className="mb-3 font-display text-lg font-semibold text-cypress-700">
                    {formatKes(property.price, { compact: true })}{property.listingType === 'RENT' ? '/mo' : ''}
                  </p>
                  <div className="mb-3 flex items-center gap-3 text-xs text-muted">
                    {property.bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={13} /> {property.bedrooms}</span>}
                    {property.bathrooms != null && <span className="flex items-center gap-1"><Bath size={13} /> {property.bathrooms}</span>}
                  </div>
                  {note && <p className="border-t border-line pt-3 text-sm italic text-muted">"{note}"</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
