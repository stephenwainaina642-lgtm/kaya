import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LISTING_TYPES, PROPERTY_TYPES } from '@kaya/shared';
import type { OwnerListItem, Page } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { unitLabelsPreview } from '../lib/units';

/** Creates every unit of a block at once, so a 120-flat estate is one form, not 120. */
export function NewBuildingForm({ onDone }: { onDone: (building: string) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: owners } = useQuery({ queryKey: ['owners', 'all'], queryFn: () => api.get<Page<OwnerListItem>>('/owners', { pageSize: 100 }) });
  const [building, setBuilding] = useState('');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('Nairobi');
  const [ownerId, setOwnerId] = useState('');
  const [listingType, setListingType] = useState<string>('RENT');
  const [propertyType, setPropertyType] = useState<string>('APARTMENT');
  const [floors, setFloors] = useState('4');
  const [perFloor, setPerFloor] = useState('6');
  const [startFloor, setStartFloor] = useState('1');
  const [bedrooms, setBedrooms] = useState('2');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const labels = unitLabelsPreview(Number(floors) || 0, Number(perFloor) || 0, Number(startFloor) || 0);

  const create = useMutation({
    mutationFn: () => api.post('/properties/bulk', {
      building, location, city, ownerId, listingType, propertyType,
      floors: Number(floors), unitsPerFloor: Number(perFloor), startFloor: Number(startFloor),
      bedrooms: bedrooms === '' ? null : Number(bedrooms), price: Number(price), currency: user?.currency,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buildings'] });
      qc.invalidateQueries({ queryKey: ['properties'] });
      onDone(building);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
      <Field label="Building or estate name">
        <Input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="Nyali Heights" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Area"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Nyali" required /></Field>
        <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} required /></Field>
      </div>
      <Field label="Owner">
        <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
          <option value="">Select owner…</option>
          {owners?.items.map((o) => <option key={o.id} value={o.id}>{o.companyName ?? o.fullName}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Listing">
          <Select value={listingType} onChange={(e) => setListingType(e.target.value)}>
            {LISTING_TYPES.map((t) => <option key={t} value={t}>{t === 'RENT' ? 'To let' : 'For sale'}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Floors"><Input type="number" min="1" max="60" value={floors} onChange={(e) => setFloors(e.target.value)} required /></Field>
        <Field label="Units per floor"><Input type="number" min="1" max="40" value={perFloor} onChange={(e) => setPerFloor(e.target.value)} required /></Field>
        <Field label="First floor"><Input type="number" min="0" max="100" value={startFloor} onChange={(e) => setStartFloor(e.target.value)} required /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bedrooms per unit"><Input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} /></Field>
        <Field label={listingType === 'RENT' ? `Monthly rent (${user?.currency ?? 'KES'})` : `Price (${user?.currency ?? 'KES'})`}>
          <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </Field>
      </div>
      <p className="mb-4 rounded-control bg-sunk px-3 py-2 text-sm text-muted">
        {labels.length > 0
          ? <>Creates <strong className="text-ink">{labels.length} units</strong>: {labels.slice(0, 4).join(', ')}{labels.length > 4 ? ` … ${labels[labels.length - 1]}` : ''}</>
          : 'Enter floors and units to preview.'}
        {labels.length > 400 && <span className="ml-1 text-danger">Maximum 400 at a time.</span>}
      </p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending || !ownerId || labels.length === 0 || labels.length > 400} className="w-full">
        {create.isPending ? 'Creating units…' : `Create ${labels.length || ''} units`}
      </Button>
    </form>
  );
}
