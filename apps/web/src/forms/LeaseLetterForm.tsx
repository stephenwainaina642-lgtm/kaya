import { useState } from 'react';
import type { LeaseItem } from '@kaya/shared';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { printLeaseLetter, type LetterKind } from '../lib/leaseLetter';
import { currencyCode } from '../lib/currency';
import { money as kes } from '../lib/currency';

const plus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const plusYear = (d: string | null) => {
  const base = d ? new Date(d) : new Date();
  base.setUTCFullYear(base.getUTCFullYear() + 1);
  return base.toISOString().slice(0, 10);
};

export function LeaseLetterForm({ lease, onDone }: { lease: LeaseItem; onDone: () => void }) {
  const { user } = useAuth();
  const [kind, setKind] = useState<LetterKind>('RENEWAL');
  const [rent, setRent] = useState(String(lease.rentAmount));
  const [date, setDate] = useState(plusYear(lease.endDate));
  const [replyBy, setReplyBy] = useState(plus(14));
  const [signedBy, setSignedBy] = useState(user?.name ?? '');

  const onKind = (k: LetterKind) => { setKind(k); setDate(k === 'RENEWAL' ? plusYear(lease.endDate) : plus(60)); };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      printLeaseLetter(user?.organizationName ?? 'Your agent', lease, { kind, newRent: Math.round(Number(rent)), date, replyBy, signedBy });
      onDone();
    }}>
      <p className="mb-4 text-sm text-muted">{lease.tenantName} · {lease.propertyTitle}. Currently {kes(lease.rentAmount)} a month.</p>
      <Field label="Letter">
        <Select value={kind} onChange={(e) => onKind(e.target.value as LetterKind)}>
          <option value="RENEWAL">Offer to renew the tenancy</option>
          <option value="INCREASE">Notice of rent review</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`New monthly rent (${currencyCode()})`}><Input type="number" min={1} value={rent} onChange={(e) => setRent(e.target.value)} required /></Field>
        <Field label={kind === 'RENEWAL' ? 'New end date' : 'New rent starts on'}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Reply by"><Input type="date" value={replyBy} onChange={(e) => setReplyBy(e.target.value)} required /></Field>
        <Field label="Signed by"><Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} required /></Field>
      </div>
      <p className="mb-3 text-xs text-muted">Check the notice period in the tenancy agreement before you send a rent change. The letter refers to the agreement and does not state a legal period for you. Printing does not change the lease; use Renew to record the new terms.</p>
      <Button type="submit">Print letter</Button>
    </form>
  );
}
