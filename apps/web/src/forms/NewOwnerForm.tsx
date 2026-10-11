import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export function NewOwnerForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post('/owners', { fullName: fullName || null, phone, email: email || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owners'] });
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
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending} className="w-full">
        {create.isPending ? 'Creating…' : 'Create owner'}
      </Button>
    </form>
  );
}
