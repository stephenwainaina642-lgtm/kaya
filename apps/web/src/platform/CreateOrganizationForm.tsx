import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PLANS } from '@kaya/shared';
import type { PlatformCreateOrgResult } from '@kaya/shared';
import { platformApi, ApiError } from './api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';

export function CreateOrganizationForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [organizationName, setOrganizationName] = useState('');
  const [plan, setPlan] = useState<string>('STARTER');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlatformCreateOrgResult | null>(null);

  const create = useMutation({
    mutationFn: () =>
      platformApi.post<PlatformCreateOrgResult>('/organizations', { organizationName, plan, adminName, adminEmail }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['platform-organizations'] });
      qc.invalidateQueries({ queryKey: ['platform-stats'] });
      setResult(res);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  if (result) {
    return (
      <div>
        <p className="mb-3 text-sm text-ink">
          <span className="font-medium">{result.organization.name}</span> is live on Kaya. Share these sign-in
          details with {result.admin.name} directly (WhatsApp, a call — not email, Kaya doesn't send any) — they
          can change the password once logged in.
        </p>
        <div className="mb-4 space-y-2 rounded-control border border-line bg-ground p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Sign-in page</span><span className="font-medium text-ink">{window.location.origin}/login</span></div>
          <div className="flex justify-between"><span className="text-muted">Email</span><span className="font-medium text-ink">{result.admin.email}</span></div>
          <div className="flex justify-between"><span className="text-muted">Temporary password</span><span className="font-mono font-medium text-ink">{result.admin.tempPassword}</span></div>
        </div>
        <Button onClick={onDone} className="w-full">Done</Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <Field label="Agency name">
        <Input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required placeholder="e.g. Savanna Ridge Realty" />
      </Field>
      <Field label="Plan">
        <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </Field>
      <Field label="Admin's full name">
        <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
      </Field>
      <Field label="Admin's email">
        <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending} className="w-full">
        {create.isPending ? 'Creating…' : 'Create organization'}
      </Button>
    </form>
  );
}
