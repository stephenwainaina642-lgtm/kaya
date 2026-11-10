import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, CheckCircle2 } from 'lucide-react';
import { periodLabel, type MpesaApplyResult, type MpesaMatchResult } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TextArea } from '../components/ui/TextArea';
import { money as kes } from '../lib/currency';

export function MatchMpesaForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<MpesaMatchResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<MpesaApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const find = useMutation({
    mutationFn: () => api.post<MpesaMatchResult>('/rent/mpesa/match', { text }),
    onSuccess: (r) => {
      setResult(r); setError(null);
      setPicked(new Set(r.matches.filter((m) => m.confidence === 'HIGH').map((m) => m.code)));
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Something went wrong'),
  });
  const apply = useMutation({
    mutationFn: () => api.post<MpesaApplyResult>('/rent/mpesa/apply', {
      items: result!.matches.filter((m) => picked.has(m.code)).map((m) => ({ code: m.code, chargeId: m.chargeId, amount: m.applyAmount, paidAt: m.paidAt })),
    }),
    onSuccess: (r) => { setDone(r); qc.invalidateQueries({ queryKey: ['rent'] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Something went wrong'),
  });

  if (done) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cypress-700"><CheckCircle2 size={18} /><span className="font-medium">{done.recorded} payments recorded</span></div>
        {done.failed.length > 0 && (
          <ul className="space-y-1 rounded-md bg-sunk p-3 text-sm text-ink">
            {done.failed.map((f) => <li key={f.code}>{f.code}: {f.error}</li>)}
          </ul>
        )}
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          Paste your M-Pesa confirmation messages, or upload the statement you download from the M-Pesa portal (CSV). Kaya finds the tenant for each payment and puts it on the oldest month they owe. You check the list before anything is recorded.
        </p>
        <TextArea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="QJK1ABC2XY Confirmed. Ksh85,000.00 received from AMINA YUSUF 0722 000 000 on 5/3/26 at 10:15 AM…" />
        <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ''; }} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => file.current?.click()}><Upload size={15} className="mr-1.5" /> Upload CSV</Button>
          <Button type="button" disabled={find.isPending || text.trim().length < 10} onClick={() => find.mutate()}>{find.isPending ? 'Matching…' : 'Find matches'}</Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const chosen = result.matches.filter((m) => picked.has(m.code));
  const total = chosen.reduce((n, m) => n + m.applyAmount, 0);
  const toggle = (code: string) => setPicked((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Found {result.found} payments: {result.matches.length} matched{result.duplicates.length ? `, ${result.duplicates.length} already recorded` : ''}{result.unmatched.length ? `, ${result.unmatched.length} not matched` : ''}.
        Ticked rows will be recorded. Rows matched by name only are not ticked, so check them first.
      </p>
      {result.matches.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <tbody>
              {result.matches.map((m) => (
                <tr key={m.code} className="border-b border-line last:border-0">
                  <td className="px-3 py-2"><input type="checkbox" checked={picked.has(m.code)} onChange={() => toggle(m.code)} aria-label={`Record ${m.code}`} /></td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">{m.tenantName}</p>
                    <p className="text-xs text-muted">{m.propertyTitle} · {periodLabel(m.period)} · {m.code}</p>
                    {m.leftover > 0 && <p className="text-xs text-warn">{kes(m.leftover)} more than this month owes. Record the rest yourself.</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{kes(m.applyAmount)}</td>
                  <td className="px-3 py-2">{m.confidence === 'HIGH' ? <Badge tone="ok">Phone</Badge> : <Badge tone="warn">Name only</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.unmatched.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">{result.unmatched.length} not matched</summary>
          <ul className="mt-2 space-y-1 text-ink">
            {result.unmatched.map((u) => <li key={u.code}>{u.code} · {kes(u.amount)} · {u.name || u.phone || 'unknown'} <span className="text-muted">({u.reason})</span></li>)}
          </ul>
        </details>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <Button disabled={apply.isPending || chosen.length === 0} onClick={() => apply.mutate()}>
          {apply.isPending ? 'Recording…' : `Record ${chosen.length} payments (${kes(total)})`}
        </Button>
        <Button variant="ghost" onClick={() => { setResult(null); setDone(null); }}>Back</Button>
      </div>
    </div>
  );
}
