import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ROLES } from '@kaya/shared';
import type { TeamMember } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';

export function InviteMemberForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('AGENT');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const invite = useMutation({
    mutationFn: () => api.post<{ member: TeamMember; tempPassword: string }>('/team/members', { name, email, role }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['team'] });
      setResult({ email, tempPassword: res.tempPassword });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  if (result) {
    return (
      <div>
        <p className="mb-3 text-sm text-ink">
          <span className="font-medium">{name}</span> has been added. Share these sign-in details with them —
          they can change the password once logged in.
        </p>
        <div className="mb-4 space-y-2 rounded-control border border-line bg-ground p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Email</span><span className="font-medium text-ink">{result.email}</span></div>
          <div className="flex justify-between"><span className="text-muted">Temporary password</span><span className="font-mono font-medium text-ink">{result.tempPassword}</span></div>
        </div>
        <Button onClick={onDone} className="w-full">Done</Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Role">
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </Select>
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={invite.isPending} className="w-full">
        {invite.isPending ? 'Adding…' : 'Add team member'}
      </Button>
    </form>
  );
}
