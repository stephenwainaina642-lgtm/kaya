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
import { FloorPlan } from '../../components/FloorPlan';
import { UnitDesk, useUnitData } from '../../components/UnitTenancy';
import { EditPropertyForm } from '../../forms/EditPropertyForm';


const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ');

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const qc = useQueryClient();
  const { data: p, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get<PropertyDetailT>(`/properties/${id}`),
  });

  const { lease: tenancy, open: openList } = useUnitData(id ?? '');
  const removePhoto = useMutation({
    mutationFn: (imageId: string) => api.del(`/properties/${id}/images/${imageId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['property', id] }); qc.invalidateQueries({ queryKey: ['properties'] }); },
  });

  const statusPill = tenancy ? 'bg-ink text-white' : p?.status === 'AVAILABLE' ? 'border border-accent/40 bg-accent-soft text-accent-deep' : 'bg-sunk text-muted';

  if (isLoading || !p) {
    return (<><PageHeader title="Property" /><Spinner /></>);
  }

  return (
    <>
      <PageHeader
        title={p.unitNumber ? `Unit ${p.unitNumber}` : p.title}
        subtitle={[p.building, p.location].filter(Boolean).join(' · ') || p.reference}
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
      <UnitDesk propertyId={p.id} suggestedRent={p.listingType === 'RENT' ? p.price : 0}>
        {({ main, side }) => (
          <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-3 lg:p-8">
            <div className="space-y-6 lg:col-span-2">
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusPill}`}>{tenancy ? 'Let' : p.status === 'AVAILABLE' ? 'Vacant' : nice(p.status)}</span>
                    {tenancy && <span className="text-sm text-muted">to <span className="font-medium text-ink">{tenancy.tenantName}</span></span>}
                  </div>
                  {openList.length > 0 && <span className="rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white">{openList.length} open {openList.length === 1 ? 'repair' : 'repairs'}</span>}
                </div>
                <div className="px-4 pb-2 pt-4 sm:px-8"><FloorPlan bedrooms={p.bedrooms} bathrooms={p.bathrooms} issues={openList} unit={p.unitNumber ?? p.title} /></div>
                <dl className="grid grid-cols-2 divide-x divide-line border-t border-line sm:grid-cols-4">
                  {[
                    [BedDouble, 'Bedrooms', p.bedrooms ?? '—'],
                    [Bath, 'Bathrooms', p.bathrooms ?? '—'],
                    [Ruler, 'Size', p.sizeSqm != null ? `${p.sizeSqm} m²` : '—'],
                    [MapPin, p.listingType === 'RENT' || tenancy ? 'Rent' : 'Price', tenancy ? `${formatMoney(tenancy.rentAmount, p.currency, { compact: true })}/mo` : `${formatMoney(p.price, p.currency, { compact: true })}${p.listingType === 'RENT' ? '/mo' : ''}`],
                  ].map(([Icon, label, value], i) => { const I = Icon as typeof BedDouble; return (
                    <div key={label as string} className={`px-5 py-4 ${i > 1 ? 'border-t border-line sm:border-t-0' : ''}`}>
                      <dt className="flex items-center gap-1.5 text-xs text-muted"><I size={13} /> {label as string}</dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-ink">{value as string | number}</dd>
                    </div>
                  ); })}
                </dl>
                <div className="flex items-center gap-2 overflow-x-auto border-t border-line bg-sunk/60 px-5 py-3 sm:px-6">
                  {p.images.length === 0 && <span className="text-xs text-faint">No photos needed. Photos are optional and only appear on public listings.</span>}
                  {p.images.map((img) => (
                    <div key={img.id} className="group relative h-12 w-16 shrink-0">
                      <img src={img.url} className="h-full w-full rounded-control object-cover" alt="" />
                      <button type="button" aria-label="Remove photo" onClick={() => removePhoto.mutate(img.id)}
                        className="absolute right-0.5 top-0.5 hidden rounded-full bg-white/90 p-0.5 text-ink group-hover:block group-focus-within:block"><X size={11} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setShowPhotos(true)} className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-medium text-accent hover:underline"><ImagePlus size={14} /> Add listing photo</button>
                </div>
              </Card>
              <div className="space-y-6 lg:hidden">{side}</div>
              {main}
              <Card className="p-5 sm:p-6">
                <h2 className="mb-3 text-[0.95rem] font-semibold tracking-tight text-ink">About this property</h2>
                <p className="text-sm leading-relaxed text-muted">{p.description ?? 'No description provided.'}</p>
                {p.features.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{p.features.map((f) => <Badge key={f.key}>{f.label}</Badge>)}</div>}
              </Card>
              <PropertyPeople propertyId={p.id} />
              <ContactMatchesPanel propertyId={p.id} />
            </div>
            <div className="space-y-6">
              <div className="hidden lg:block">{side}</div>
              <Card className="p-5">
                <p className="text-xs uppercase tracking-wide text-faint">Property</p>
                <p className="mt-2 text-sm font-medium text-ink">{p.reference}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {p.location}</p>
                {p.building && (
                  <Link to={`/buildings/${encodeURIComponent(p.building)}`} className="mt-4 flex items-center justify-between rounded-control border border-line px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-sunk">
                    <span>{p.building}</span><span className="text-xs text-accent">See all units →</span>
                  </Link>
                )}
              </Card>
              <AdvertiseCard property={p} />
            </div>
          </div>
        )}
      </UnitDesk>
    </>
  );
}
