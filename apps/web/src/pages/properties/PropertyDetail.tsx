import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BedDouble, Bath, Ruler, MapPin, Pencil, ImagePlus, X } from 'lucide-react';
import type { PropertyDetail as PropertyDetailT } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { PhotoUploader } from '../../components/PhotoUploader';
import { PageHeader } from '../../components/PageHeader';
import { PropertyPeople, AdvertiseCard } from '../../components/PropertyNetwork';
import { ContactMatchesPanel } from '../../components/ContactMatchesPanel';
import { EditPropertyForm } from '../../forms/EditPropertyForm';

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const qc = useQueryClient();
  const { data: p, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get<PropertyDetailT>(`/properties/${id}`),
  });

  const removePhoto = useMutation({
    mutationFn: (imageId: string) => api.del(`/properties/${id}/images/${imageId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', id] }); qc.invalidateQueries({ queryKey: ['properties'] }); },
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
      <Modal open={showPhotos} onClose={() => setShowPhotos(false)} title="Add photos">
        <PhotoUploader endpoint={`/properties/${p.id}/photos`} onDone={() => { setShowPhotos(false); qc.invalidateQueries({ queryKey: ['property', p.id] }); qc.invalidateQueries({ queryKey: ['properties'] }); }} />
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
            <div className="flex items-center gap-2 overflow-x-auto p-3">
              {p.images.map((img) => (
                <div key={img.id} className="group relative h-16 w-20 shrink-0">
                  <img src={img.url} className="h-full w-full rounded-control object-cover" alt="" />
                  <button type="button" aria-label="Remove photo" onClick={() => removePhoto.mutate(img.id)}
                    className="absolute right-0.5 top-0.5 hidden rounded-full bg-white/90 p-0.5 text-ink group-hover:block group-focus-within:block"><X size={11} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setShowPhotos(true)}
                className="flex h-16 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-control border border-dashed border-[#cfd5dd] text-xs text-muted hover:border-ink hover:text-ink">
                <ImagePlus size={16} /> Add photos
              </button>
            </div>
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
          <PropertyPeople propertyId={p.id} />
          <ContactMatchesPanel propertyId={p.id} />
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <Badge tone={p.status === 'AVAILABLE' ? 'ok' : 'neutral'}>{p.status}</Badge>
            {p.building && (
              <Link to={`/buildings/${encodeURIComponent(p.building)}`} className="ml-2 text-sm text-accent hover:underline">{p.building}{p.unitNumber ? ` · Unit ${p.unitNumber}` : ''}</Link>
            )}
            <p className="mt-3 text-2xl font-semibold tabular-nums text-ink">
              {formatMoney(p.price, p.currency, { compact: true })}{p.listingType === 'RENT' ? '/mo' : ''}
            </p>
            <p className="mb-4 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {p.location}</p>
            <div className="flex items-center gap-4 border-t border-line pt-4 text-sm text-muted">
              {p.bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={15} /> {p.bedrooms} bed</span>}
              {p.bathrooms != null && <span className="flex items-center gap-1"><Bath size={15} /> {p.bathrooms} bath</span>}
              {p.sizeSqm != null && <span className="flex items-center gap-1"><Ruler size={15} /> {p.sizeSqm}m²</span>}
            </div>
          </Card>
          <AdvertiseCard property={p} />
        </div>
      </div>
    </>
  );
}
