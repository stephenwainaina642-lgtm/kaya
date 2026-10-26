import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OFFER_PARTIES } from '@kaya/shared';
import type { DealDetail } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function NewOfferForm({ dealId, onDone }: { dealId: string; onDone: () => void }) {
  const { user } = useAuth();
  const currency = user?.currency ?? 'KES';
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [madeBy, setMadeBy] = useState<string>(OFFER_PARTIES[0]);
  const [conditions, setConditions] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<DealDetail>(`/deals/${dealId}/offers`, {
        amount: Number(amount),
        madeBy,
        conditions: conditions.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal', dealId] });
      qc.invalidateQueries({ queryKey: ['deals-board'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Offer amount (${currency})`}>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Made by">
          <Select value={madeBy} onChange={(e) => setMadeBy(e.target.value)}>
            {OFFER_PARTIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Conditions (optional)">
        <TextArea rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Subject to mortgage approval" />
      </Field>
      <Field label="Notes (optional)">
        <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending || !amount} className="w-full">
        {create.isPending ? 'Recording…' : 'Record offer'}
      </Button>
    </form>
  );
}
