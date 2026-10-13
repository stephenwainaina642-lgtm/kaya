import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COMM_CHANNELS, COMM_DIRECTIONS } from '@kaya/shared';
import type { LeadListItem, ClientListItem, OwnerListItem, Page } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function LogCommunicationForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<string>(COMM_CHANNELS[0]);
  const [direction, setDirection] = useState<string>('OUTBOUND');
  const [contactKind, setContactKind] = useState<'leadId' | 'clientId' | 'ownerId'>('leadId');
  const [contactId, setContactId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [durationSeconds, setDurationSeconds] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: leads } = useQuery({
    queryKey: ['leads-picker'],
    queryFn: () => api.get<Page<LeadListItem>>('/leads', { pageSize: 100 }),
    enabled: contactKind === 'leadId',
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-picker'],
    queryFn: () => api.get<Page<ClientListItem>>('/clients', { pageSize: 100 }),
    enabled: contactKind === 'clientId',
  });
  const { data: owners } = useQuery({
    queryKey: ['owners-picker'],
    queryFn: () => api.get<Page<OwnerListItem>>('/owners', { pageSize: 100 }),
    enabled: contactKind === 'ownerId',
  });

  const log = useMutation({
    mutationFn: () =>
      api.post('/communications', {
        channel,
        direction,
        [contactKind]: contactId,
        subject: subject.trim() || null,
        body: body.trim() || null,
        occurredAt: new Date(occurredAt).toISOString(),
        durationSeconds: channel === 'CALL' && durationSeconds ? Number(durationSeconds) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['communications'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const contactOptions =
    contactKind === 'leadId' ? leads?.items.map((l) => ({ id: l.id, label: l.fullName })) :
    contactKind === 'clientId' ? clients?.items.map((c) => ({ id: c.id, label: c.fullName })) :
    owners?.items.map((o) => ({ id: o.id, label: o.fullName ?? o.companyName ?? 'Owner' }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); log.mutate(); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {COMM_CHANNELS.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
            {COMM_DIRECTIONS.map((d) => <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact type">
          <Select
            value={contactKind}
            onChange={(e) => { setContactKind(e.target.value as typeof contactKind); setContactId(''); }}
          >
            <option value="leadId">Lead</option>
            <option value="clientId">Client</option>
            <option value="ownerId">Owner</option>
          </Select>
        </Field>
        <Field label="Contact">
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)} required>
            <option value="">Select…</option>
            {contactOptions?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Subject (optional)">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Follow-up on Kilimani listing" />
      </Field>
      <Field label="Notes (optional)">
        <TextArea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="When">
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
        </Field>
        {channel === 'CALL' && (
          <Field label="Duration (seconds, optional)">
            <Input type="number" min={0} value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} />
          </Field>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={log.isPending || !contactId} className="w-full">
        {log.isPending ? 'Logging…' : 'Log communication'}
      </Button>
    </form>
  );
}
