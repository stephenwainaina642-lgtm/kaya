import { useMemo, useState } from 'react';
import type { LeaseItem } from '@kaya/shared';
import { useAuth } from '../auth/AuthContext';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { printLeaseLetters } from '../lib/leaseLetter';
import { money as kes } from '../lib/currency';

const plus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Prints a rent review notice for each chosen lease, with one percentage applied to all of them. */
export function BatchIncreaseForm({ leases, onDone }: { leases: LeaseItem[]; onDone: () => void }) {
  const { user } = useAuth();
  const active = useMemo(() => leases.filter((l) => l.status === 'ACTIVE'), [leases]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(active.map((l) => l.id)));
  const [pct, setPct] = useState('5');
  const [start, setStart] = useState(plus(60));
  const [replyBy, setReplyBy] = useState(plus(14));
  const [signedBy, setSignedBy] = useState(user?.name ?? '');
  const rate = Number(pct);
  const newRent = (l: LeaseItem) => Math.round(l.rentAmount * (1 + rate / 100));
  const chosen = active.filter((l) => picked.has(l.id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      printLeaseLetters(user?.organizationName ?? 'Your agent', chosen.map((lease) => ({ lease, input: { kind: 'INCREASE', newRent: newRent(lease), date: start, replyBy, signedBy } })));
      onDone();
    }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Increase (%)"><Input type="number" step="0.1" min={-50} max={100} value={pct} onChange={(e) => setPct(e.target.value)} required /></Field>
        <Field label="New rent starts on"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Reply by"><Input type="date" value={replyBy} onChange={(e) => setReplyBy(e.target.value)} required /></Field>
        <Field label="Signed by"><Input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} required /></Field>
      </div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium text-ink">{chosen.length} of {active.length} leases</span>
        <button type="button" className="text-accent hover:underline" onClick={() => setPicked(chosen.length === active.length ? new Set() : new Set(active.map((l) => l.id)))}>
          {chosen.length === active.length ? 'Clear all' : 'Select all'}
        </button>
      </div>
      <ul className="mb-3 max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
        {active.map((l) => (
          <li key={l.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-sunk">
              <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
              <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{l.propertyTitle}</span><span className="block truncate text-xs text-muted">{l.tenantName}</span></span>
              <span className="whitespace-nowrap text-xs text-muted">{kes(l.rentAmount)} → <span className="font-medium text-ink">{Number.isFinite(rate) ? kes(newRent(l)) : '—'}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mb-3 text-xs text-muted">Check the notice period in each tenancy agreement before sending. Printing does not change any lease; use Renew to record new terms.</p>
      <Button type="submit" disabled={!chosen.length || !Number.isFinite(rate)}>Print {chosen.length || ''} letter{chosen.length === 1 ? '' : 's'}</Button>
    </form>
  );
}
