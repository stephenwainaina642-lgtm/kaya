import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeadListItem, ClientListItem, PropertyListItem, Page } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function NewViewingForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState('');
  const [contactType, setContactType] = useState<'lead' | 'client'>('lead');
  const [contactId, setContactId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [meetingLocation, setMeetingLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: properties } = useQuery({
    queryKey: ['properties-picker'],
    queryFn: () => api.get<Page<PropertyListItem>>('/properties', { pageSize: 100 }),
  });
  const { data: leads } = useQuery({
    queryKey: ['leads-picker'],
    queryFn: () => api.get<Page<LeadListItem>>('/leads', { pageSize: 100 }),
    enabled: contactType === 'lead',
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-picker'],
    queryFn: () => api.get<Page<ClientListItem>>('/clients', { pageSize: 100 }),
    enabled: contactType === 'client',
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/viewings', {
        propertyId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes,
        meetingLocation: meetingLocation || null,
        notes: notes || null,
        leadId: contactType === 'lead' ? contactId : undefined,
        clientId: contactType === 'client' ? contactId : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viewings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <Field label="Property">
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
          <option value="">Select…</option>
          {properties?.items.map((p) => (
            <option key={p.id} value={p.id}>{p.title} — {p.location}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact type">
          <Select value={contactType} onChange={(e) => { setContactType(e.target.value as 'lead' | 'client'); setContactId(''); }}>
            <option value="lead">Lead</option>
            <option value="client">Client</option>
          </Select>
        </Field>
        <Field label="Contact">
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)} required>
            <option value="">Select…</option>
            {(contactType === 'lead' ? leads?.items : clients?.items)?.map((c) => (
              <option key={c.id} value={c.id}>{c.fullName}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date & time">
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
        </Field>
        <Field label="Duration (minutes)">
          <Input type="number" min={10} max={480} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} required />
        </Field>
      </div>
      <Field label="Meeting location (optional)">
        <Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} placeholder="e.g. At the property" />
      </Field>
      <Field label="Notes (optional)">
        <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending || !propertyId || !contactId} className="w-full">
        {create.isPending ? 'Scheduling…' : 'Schedule viewing'}
      </Button>
    </form>
  );
}
