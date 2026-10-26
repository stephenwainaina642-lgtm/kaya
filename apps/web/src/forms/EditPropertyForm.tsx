import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LISTING_TYPES, PROPERTY_TYPES, SEGMENTS, PROPERTY_STATUSES } from '@kaya/shared';
import type { OwnerListItem, Page, PropertyDetail } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function EditPropertyForm({ property, onDone }: { property: PropertyDetail; onDone: () => void }) {
  const { user } = useAuth();
  const currency = user?.currency ?? 'KES';
  const qc = useQueryClient();
  const { data: owners } = useQuery({
    queryKey: ['owners-picker'],
    queryFn: () => api.get<Page<OwnerListItem>>('/owners', { pageSize: 100 }),
  });

  const [title, setTitle] = useState(property.title);
  const [listingType, setListingType] = useState<string>(property.listingType);
  const [propertyType, setPropertyType] = useState<string>(property.propertyType);
  const [segment, setSegment] = useState<string>(property.segment);
  const [status, setStatus] = useState<string>(property.status);
  const [price, setPrice] = useState(String(property.price));
  const [location, setLocation] = useState(property.location);
  const [bedrooms, setBedrooms] = useState(property.bedrooms != null ? String(property.bedrooms) : '');
  const [bathrooms, setBathrooms] = useState(property.bathrooms != null ? String(property.bathrooms) : '');
  const [ownerId, setOwnerId] = useState(property.ownerId);
  const [description, setDescription] = useState(property.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/properties/${property.id}`, {
        title, listingType, propertyType, segment, status,
        price: Number(price), location, ownerId,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        description: description || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['properties'] });
      qc.invalidateQueries({ queryKey: ['property', property.id] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Listing">
          <Select value={listingType} onChange={(e) => setListingType(e.target.value)}>
            {LISTING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {PROPERTY_STATUSES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
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
          <Input value={location} onChange={(e) => setLocation(e.target.value)} required />
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
          {owners?.items.map((o) => (
            <option key={o.id} value={o.id}>{o.fullName ?? o.companyName}</option>
          ))}
        </Select>
      </Field>
      <Field label="Description (optional)">
        <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={update.isPending} className="w-full">
        {update.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
