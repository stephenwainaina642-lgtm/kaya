import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LEAD_TYPES } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';

export function NewClientForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [leadType, setLeadType] = useState<string>('BUYER');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post('/clients', { fullName, phone, email: email || null, leadType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>
      <Field label="Phone">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" required />
      </Field>
      <Field label="Email (optional)">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Type">
        <Select value={leadType} onChange={(e) => setLeadType(e.target.value)}>
          {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending} className="w-full">
        {create.isPending ? 'Creating…' : 'Create client'}
      </Button>
    </form>
  );
}
