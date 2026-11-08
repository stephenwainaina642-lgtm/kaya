import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeaseItem } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;

export function SettleDepositForm({ lease, onDone }: { lease: LeaseItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [deduction, setDeduction] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const kept = Math.max(0, Math.round(Number(deduction) || 0));
  const refund = lease.depositAmount - kept;

  const settle = useMutation({
    mutationFn: () => api.post(`/rent/leases/${lease.id}/settle-deposit`, { deduction: kept, notes: notes || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rent'] }); onDone(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); settle.mutate(); }}>
      <p className="mb-4 text-sm text-muted">{lease.tenantName} · {lease.propertyTitle}. Deposit held: <strong className="text-ink">{kes(lease.depositAmount)}</strong></p>
      <Field label="Deductions (KES): damage, unpaid rent, utilities">
        <Input type="number" min={0} max={lease.depositAmount} value={deduction} onChange={(e) => setDeduction(e.target.value)} required />
      </Field>
      <Field label="What was deducted for (optional)">
        <TextArea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Repainting living room, KES 8,000" />
      </Field>
      <p className={`mb-3 text-sm ${refund < 0 ? 'text-danger' : 'text-ink'}`}>
        Refund to tenant: <strong>{kes(Math.max(0, refund))}</strong>
      </p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={settle.isPending || refund < 0}>{settle.isPending ? 'Saving…' : 'Record settlement'}</Button>
      <p className="mt-3 text-xs text-muted">This records the settlement. It does not move money; refund the tenant yourself, then keep the receipt.</p>
    </form>
  );
}
