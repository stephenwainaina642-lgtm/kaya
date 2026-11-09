import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaseItem, RenewalSuggestion } from '@kaya/shared';
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
  const [copied, setCopied] = useState(false);
  const suggest = useMutation({
    mutationFn: () => api.post<RenewalSuggestion>(`/ai/rent/leases/${lease.id}/renewal`),
    onSuccess: (r) => setRent(String(r.suggestedRent)),
  });
  const s = suggest.data;

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
      <div className="mb-3">
        <Button type="button" variant="secondary" disabled={suggest.isPending} onClick={() => suggest.mutate()}>{suggest.isPending ? 'Thinking…' : 'Suggest with AI'}</Button>
        {suggest.isError && <p className="mt-2 text-sm text-danger">{suggest.error instanceof ApiError ? suggest.error.message : 'Could not get a suggestion'}</p>}
        {s && (
          <div className="mt-2 space-y-2 rounded-panel border border-line p-3 text-sm">
            <p className="text-ink">Suggested rent: <span className="font-medium">KES {s.suggestedRent.toLocaleString('en-KE')}</span>{s.suggestedRent === s.currentRent ? ' (no change)' : ` (+${Math.round((s.suggestedRent / s.currentRent - 1) * 1000) / 10}%)`}</p>
            <p className="text-xs text-muted">{s.paymentSummary}{s.comparables ? ` Similar units you manage (${s.comparables.count}) rent for about KES ${s.comparables.median.toLocaleString('en-KE')}.` : ''}</p>
            {s.rationale && <p className="text-xs text-ink">{s.rationale}</p>}
            {s.message && (
              <>
                <p className="rounded-md bg-sunk p-2 text-ink">{s.message}</p>
                <Button type="button" variant="ghost" onClick={() => { navigator.clipboard.writeText(s.message); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy offer'}</Button>
              </>
            )}
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-muted">A changed rent applies to months raised from now on; rent already raised stays as it was.</p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={renew.isPending}>{renew.isPending ? 'Saving…' : 'Renew lease'}</Button>
    </form>
  );
}
