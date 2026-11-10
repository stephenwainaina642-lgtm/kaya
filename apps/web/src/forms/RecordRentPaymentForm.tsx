import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RENT_PAYMENT_METHODS, type RentChargeItem } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { currencyCode } from '../lib/currency';
import { money as kes } from '../lib/currency';

export function RecordRentPaymentForm({ charge, onDone }: { charge: RentChargeItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(charge.balance));
  const [method, setMethod] = useState<(typeof RENT_PAYMENT_METHODS)[number]>('MPESA');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pay = useMutation({
    mutationFn: () =>
      api.post(`/rent/charges/${charge.id}/payments`, {
        amount: Math.round(Number(amount)), method, reference: reference.trim() || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rent'] }); onDone(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); pay.mutate(); }}>
      <p className="mb-4 text-sm text-muted">
        {charge.tenantName} · {charge.propertyTitle} · {charge.period}. Balance {kes(charge.balance)}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Amount received (${currencyCode()})`}>
          <Input type="number" min={1} max={charge.balance} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {RENT_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m === 'MPESA' ? 'M-Pesa' : m[0] + m.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={method === 'MPESA' ? 'M-Pesa code' : 'Reference (optional)'}>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === 'MPESA' ? 'e.g. QA12BC34DE' : ''} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={pay.isPending}>{pay.isPending ? 'Saving…' : 'Record payment'}</Button>
    </form>
  );
}
