import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BedDouble, Bath, Ruler, MapPin, Pencil } from 'lucide-react';
import type { PropertyDetail as PropertyDetailT } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/PageHeader';
import { ContactMatchesPanel } from '../../components/ContactMatchesPanel';
import { EditPropertyForm } from '../../forms/EditPropertyForm';

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const { data: p, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get<PropertyDetailT>(`/properties/${id}`),
  });

  if (isLoading || !p) {
    return (<><PageHeader title="Property" /><Spinner /></>);
  }

  return (
    <>
      <PageHeader
        title={p.title}
        subtitle={p.reference}
        actions={
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowEdit(true)}><Pencil size={14} /> Edit</Button>
            <Link to="/properties" className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> Back</Link>
          </div>
        }
      />
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit property" width="max-w-xl">
        <EditPropertyForm property={p} onDone={() => setShowEdit(false)} />
      </Modal>
      <div className="grid grid-cols-1 gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex h-72 items-center justify-center bg-ground text-faint">
              {p.images[0] ? (
                <img src={p.images[0].url} alt={p.title} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm">No image</span>
              )}
            </div>
            {p.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {p.images.slice(1).map((img) => (
                  <img key={img.id} src={img.url} className="h-16 w-20 shrink-0 rounded-control object-cover" alt="" />
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Description</h2>
            <p className="text-sm text-muted">{p.description ?? 'No description provided.'}</p>
          </Card>
          {p.features.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Features</h2>
              <div className="flex flex-wrap gap-2">
                {p.features.map((f) => <Badge key={f.key}>{f.label}</Badge>)}
              </div>
            </Card>
          )}
          <ContactMatchesPanel propertyId={p.id} />
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <Badge tone="ok">{p.status.replace(/_/g, ' ')}</Badge>
            <p className="mt-3 font-display text-2xl font-semibold text-cypress-700">
              {formatMoney(p.price, p.currency, { compact: true })}{p.listingType === 'RENT' ? '/mo' : ''}
            </p>
            <p className="mb-4 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {p.location}</p>
            <div className="flex items-center gap-4 border-t border-line pt-4 text-sm text-muted">
              {p.bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={15} /> {p.bedrooms} bed</span>}
              {p.bathrooms != null && <span className="flex items-center gap-1"><Bath size={15} /> {p.bathrooms} bath</span>}
              {p.sizeSqm != null && <span className="flex items-center gap-1"><Ruler size={15} /> {p.sizeSqm}m²</span>}
            </div>
          </Card>
          {p.ownerId && (
            <Card className="p-5">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">Owner</h2>
              <Link to={`/owners/${p.ownerId}`} className="text-sm text-cypress-700 hover:underline">View owner</Link>
            </Card>
          )}
          {p.assignedAgent && (
            <Card className="p-5">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">Listing agent</h2>
              <p className="text-sm text-ink">{p.assignedAgent.name}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
