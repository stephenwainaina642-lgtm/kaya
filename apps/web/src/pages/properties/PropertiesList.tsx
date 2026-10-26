import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus, BedDouble, Bath } from 'lucide-react';
import type { PropertyListItem, Page } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NewPropertyForm } from '../../forms/NewPropertyForm';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  AVAILABLE: 'ok', UNDER_OFFER: 'warn', RESERVED: 'warn', LET: 'neutral', SOLD: 'neutral', WITHDRAWN: 'danger',
};

export function PropertiesList() {
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['properties', q],
    queryFn: () => api.get<Page<PropertyListItem>>('/properties', { search: q, pageSize: 50 }),
  });

  return (
    <>
      <PageHeader title="Properties" subtitle={data ? `${data.total} listings` : undefined} actions={<Button onClick={() => setShowNew(true)}><Plus size={16} /> New property</Button>} />
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New property" width="max-w-xl">
        <NewPropertyForm onDone={() => setShowNew(false)} />
      </Modal>
      <div className="p-8">
        <div className="mb-4 flex max-w-sm items-center gap-2 rounded-control border border-line bg-white px-3">
          <Search size={16} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search properties…" className="w-full bg-transparent py-2 text-sm outline-none" />
        </div>
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState title="No properties yet" body="Listings you add will appear here." /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((p) => (
              <Link key={p.id} to={`/properties/${p.id}`}>
                <Card className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex h-36 items-center justify-center bg-ground text-faint">
                    {p.coverImageUrl ? (
                      <img src={p.coverImageUrl} alt={p.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs">No image</span>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="line-clamp-1 font-medium text-ink">{p.title}</p>
                      <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{p.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="mb-2 text-xs text-muted">{p.location}</p>
                    <p className="mb-3 font-display text-lg font-semibold text-cypress-700">
                      {formatMoney(p.price, p.currency, { compact: true })}{p.listingType === 'RENT' ? '/mo' : ''}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted">
                      {p.bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={14} /> {p.bedrooms}</span>}
                      {p.bathrooms != null && <span className="flex items-center gap-1"><Bath size={14} /> {p.bathrooms}</span>}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
