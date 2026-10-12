import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LEAD_SOURCES, LEAD_TYPES, TEMPERATURES } from '@kaya/shared';
import type { LeadDetail } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function EditLeadForm({ lead, onDone }: { lead: LeadDetail; onDone: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(lead.fullName);
  const [phone, setPhone] = useState(lead.phone);
  const [email, setEmail] = useState(lead.email ?? '');
  const [source, setSource] = useState<string>(lead.source);
  const [temperature, setTemperature] = useState<string>(lead.temperature);
  const [leadType, setLeadType] = useState<string>(lead.leadType);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/leads/${lead.id}`, {
        fullName, phone, email: email || null, source, temperature, leadType, notes: notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead', lead.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>
      <Field label="Phone">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>
      <Field label="Email (optional)">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Source">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
        <Field label="Temperature">
          <Select value={temperature} onChange={(e) => setTemperature(e.target.value)}>
            {TEMPERATURES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={leadType} onChange={(e) => setLeadType(e.target.value)}>
            {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes (optional)">
        <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={update.isPending} className="w-full">
        {update.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
