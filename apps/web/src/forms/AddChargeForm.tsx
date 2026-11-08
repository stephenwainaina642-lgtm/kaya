import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RentChargeItem } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const QUICK = ['Water', 'Garbage', 'Service charge', 'Late fee'];

export function AddChargeForm({ charge, onDone }: { charge: RentChargeItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('Water');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['rent'] });

  const add = useMutation({
    mutationFn: () => api.post(`/rent/charges/${charge.id}/extras`, { label, amount: Math.round(Number(amount)) }),
    onSuccess: () => { refresh(); onDone(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/rent/charges/${charge.id}/extras/${id}`),
    onSuccess: () => { refresh(); onDone(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <div>
      <p className="mb-3 text-sm text-muted">{charge.tenantName} · {charge.propertyTitle} · {charge.period}. Month total {kes(charge.amount)}.</p>
      {charge.extras.length > 0 && (
        <ul className="mb-4 space-y-1.5 text-sm">
          {charge.extras.map((x) => (
            <li key={x.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <span>{x.label} · {kes(x.amount)}</span>
              <button type="button" className="text-xs text-danger hover:underline" disabled={remove.isPending} onClick={() => { setError(null); remove.mutate(x.id); }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => { e.preventDefault(); setError(null); add.mutate(); }}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setLabel(q)} className={`rounded-full border px-2.5 py-1 text-xs ${label === q ? 'border-cypress-600 bg-cypress-50 text-cypress-700' : 'border-line text-muted hover:bg-sunk'}`}>{q}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Item"><Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} /></Field>
          <Field label="Amount (KES)"><Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        </div>
        <p className="mb-3 text-xs text-muted">This is added to what the tenant owes this month. It is not part of the landlord's rent, so no management fee is taken on it and it stays out of their statement.</p>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Add to this month'}</Button>
      </form>
    </div>
  );
}
