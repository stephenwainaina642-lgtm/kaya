import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FOLLOW_UP_PRIORITIES, CONTACT_METHODS } from '@kaya/shared';
import type { LeadListItem, ClientListItem, Page } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function NewFollowUpForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [contactType, setContactType] = useState<'lead' | 'client'>('lead');
  const [contactId, setContactId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<string>('MEDIUM');
  const [channel, setChannel] = useState<string>('CALL');
  const [error, setError] = useState<string | null>(null);

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
      api.post('/follow-ups', {
        title,
        notes: notes || null,
        dueAt: new Date(dueAt).toISOString(),
        priority,
        channel,
        leadId: contactType === 'lead' ? contactId : undefined,
        clientId: contactType === 'client' ? contactId : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['followups'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
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
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="Notes (optional)">
        <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Due">
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {FOLLOW_UP_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CONTACT_METHODS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending || !contactId} className="w-full">
        {create.isPending ? 'Creating…' : 'Create follow-up'}
      </Button>
    </form>
  );
}
