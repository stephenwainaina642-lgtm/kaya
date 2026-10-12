import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LEAD_TYPES } from '@kaya/shared';
import type { ClientDetail } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function EditClientForm({ client, onDone }: { client: ClientDetail; onDone: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(client.fullName);
  const [phone, setPhone] = useState(client.phone);
  const [email, setEmail] = useState(client.email ?? '');
  const [leadType, setLeadType] = useState<string>(client.leadType);
  const [notes, setNotes] = useState(client.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () => api.patch(`/clients/${client.id}`, { fullName, phone, email: email || null, leadType, notes: notes || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client', client.id] });
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
      <Field label="Type">
        <Select value={leadType} onChange={(e) => setLeadType(e.target.value)}>
          {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
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
