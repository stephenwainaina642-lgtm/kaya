import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEAL_TYPES } from '@kaya/shared';
import type { ClientListItem, PropertyListItem, OwnerListItem, Page } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function NewDealForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [dealType, setDealType] = useState<string>(DEAL_TYPES[0]);
  const [clientId, setClientId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: clients } = useQuery({
    queryKey: ['clients-picker'],
    queryFn: () => api.get<Page<ClientListItem>>('/clients', { pageSize: 100 }),
  });
  const { data: properties } = useQuery({
    queryKey: ['properties-picker'],
    queryFn: () => api.get<Page<PropertyListItem>>('/properties', { pageSize: 100 }),
  });
  const { data: owners } = useQuery({
    queryKey: ['owners-picker'],
    queryFn: () => api.get<Page<OwnerListItem>>('/owners', { pageSize: 100 }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/deals', {
        name,
        dealType,
        clientId,
        propertyId: propertyId || null,
        ownerId: ownerId || null,
        dealValue: Number(dealValue),
        commissionRate: commissionRate ? Number(commissionRate) : null,
        expectedCloseDate: expectedCloseDate || null,
        notes: notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals-board'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <Field label="Deal name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Kilimani apartment sale" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={dealType} onChange={(e) => setDealType(e.target.value)}>
            {DEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select…</option>
            {clients?.items.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Property (optional)">
          <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">None</option>
            {properties?.items.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Field>
        <Field label="Owner (optional)">
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">None</option>
            {owners?.items.map((o) => <option key={o.id} value={o.id}>{o.fullName ?? o.companyName}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Deal value (KES)">
          <Input type="number" min={0} value={dealValue} onChange={(e) => setDealValue(e.target.value)} required />
        </Field>
        <Field label="Commission rate % (optional)">
          <Input type="number" min={0} max={100} step="0.01" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
        </Field>
      </div>
      <Field label="Expected close date (optional)">
        <Input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} />
      </Field>
      <Field label="Notes (optional)">
        <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending || !name || !clientId || !dealValue} className="w-full">
        {create.isPending ? 'Creating…' : 'Create deal'}
      </Button>
    </form>
  );
}
