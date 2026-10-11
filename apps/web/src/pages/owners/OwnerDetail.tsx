import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, MessageCircle } from 'lucide-react';
import type { OwnerDetail as OwnerDetailT, Page, PropertyListItem } from '@kaya/shared';
import { whatsappLink } from '@kaya/shared';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { PageHeader } from '../../components/PageHeader';

export function OwnerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: owner, isLoading } = useQuery({
    queryKey: ['owner', id],
    queryFn: () => api.get<OwnerDetailT>(`/owners/${id}`),
  });
  const { data: properties } = useQuery({
    queryKey: ['owner-properties', id],
    queryFn: () => api.get<Page<PropertyListItem>>('/properties', { ownerId: id, pageSize: 50 }),
    enabled: !!owner,
  });

  if (isLoading || !owner) return (<><PageHeader title="Owner" /><Spinner /></>);

  return (
    <>
      <PageHeader
        title={owner.fullName ?? owner.companyName ?? 'Owner'}
        actions={<Link to="/owners" className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> Back</Link>}
      />
      <div className="grid grid-cols-1 gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Properties</h2>
            {!properties || properties.items.length === 0 ? (
              <p className="text-sm text-muted">No properties linked yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {properties.items.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link to={`/properties/${p.id}`} className="text-sm font-medium text-ink hover:text-cypress-700">{p.title}</Link>
                    <p className="text-xs text-muted">{p.location}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Contact</h2>
            <p className="flex items-center gap-2 text-sm text-ink"><Phone size={14} className="text-faint" /> {owner.phone}</p>
            <a
              href={whatsappLink(owner.whatsapp ?? owner.phone)}
              target="_blank" rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-2 rounded-control bg-cypress-600 py-2 text-sm font-medium text-white hover:bg-cypress-700"
            >
              <MessageCircle size={16} /> Message on WhatsApp
            </a>
          </Card>
          {owner.commissionArrangement && (
            <Card className="p-5">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">Commission agreement</h2>
              <p className="text-sm text-ink">
                {owner.commissionArrangement === 'PERCENTAGE' ? `${owner.commissionRate}%` : `KES ${owner.commissionFixedAmount}`}
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
