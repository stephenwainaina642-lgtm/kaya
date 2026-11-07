import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaseItem } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const plusYear = (d: string | null) => {
  const base = d ? new Date(d) : new Date();
  base.setUTCFullYear(base.getUTCFullYear() + 1);
  return base.toISOString().slice(0, 10);
};

export function RenewLeaseForm({ lease, onDone }: { lease: LeaseItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [endDate, setEndDate] = useState(plusYear(lease.endDate));
  const [rent, setRent] = useState(String(lease.rentAmount));
  const [error, setError] = useState<string | null>(null);

  const renew = useMutation({
    mutationFn: () => api.post(`/rent/leases/${lease.id}/renew`, { endDate, rentAmount: Math.round(Number(rent)) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rent'] }); onDone(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); renew.mutate(); }}>
      <p className="mb-4 text-sm text-muted">
        {lease.tenantName} · {lease.propertyTitle}. Currently {lease.endDate ? `ends ${lease.endDate}` : 'open-ended'}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="New end date"><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></Field>
        <Field label="Monthly rent (KES)"><Input type="number" min={1} value={rent} onChange={(e) => setRent(e.target.value)} required /></Field>
      </div>
      <p className="mb-3 text-xs text-muted">A changed rent applies to months raised from now on; rent already raised stays as it was.</p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={renew.isPending}>{renew.isPending ? 'Saving…' : 'Renew lease'}</Button>
    </form>
  );
}
