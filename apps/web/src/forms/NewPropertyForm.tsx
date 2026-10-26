import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LISTING_TYPES, PROPERTY_TYPES, SEGMENTS } from '@kaya/shared';
import type { OwnerListItem, Page } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';

export function NewPropertyForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const currency = user?.currency ?? 'KES';
  const qc = useQueryClient();
  const { data: owners } = useQuery({
    queryKey: ['owners-picker'],
    queryFn: () => api.get<Page<OwnerListItem>>('/owners', { pageSize: 100 }),
  });

  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [listingType, setListingType] = useState<string>('SALE');
  const [propertyType, setPropertyType] = useState<string>('APARTMENT');
  const [segment, setSegment] = useState<string>('RESIDENTIAL');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/properties', {
        title, reference, listingType, propertyType, segment,
        price: Number(price), location, ownerId,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="2BR Apartment, Kilimani" required />
      </Field>
      <Field label="Reference code">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="KAY-0012" required />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Listing">
          <Select value={listingType} onChange={(e) => setListingType(e.target.value)}>
            {LISTING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Segment">
          <Select value={segment} onChange={(e) => setSegment(e.target.value)}>
            {SEGMENTS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Price (${currency})`}>
          <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </Field>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kilimani" required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bedrooms">
          <Input type="number" min="0" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
        </Field>
        <Field label="Bathrooms">
          <Input type="number" min="0" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
        </Field>
      </div>
      <Field label="Owner">
        <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
          <option value="">Select owner…</option>
          {owners?.items.map((o) => (
            <option key={o.id} value={o.id}>{o.fullName ?? o.companyName}</option>
          ))}
        </Select>
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending || !ownerId} className="w-full">
        {create.isPending ? 'Creating…' : 'Create property'}
      </Button>
    </form>
  );
}
