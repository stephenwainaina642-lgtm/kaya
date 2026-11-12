import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import type { ChecklistPhase, LeaseChecklistItem, LeaseItem } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';

const PHASES: { key: ChecklistPhase; title: string }[] = [{ key: 'IN', title: 'Move-in' }, { key: 'OUT', title: 'Move-out' }];

/** Tick-through list for hand-over and move-out. Saves as you go; add your own items per lease. */
export function LeaseChecklist({ lease }: { lease: LeaseItem }) {
  const qc = useQueryClient();
  const key = ['rent', 'checklist', lease.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<LeaseChecklistItem[]>(`/rent/leases/${lease.id}/checklist`) });
  const [items, setItems] = useState<LeaseChecklistItem[]>([]);
  const [draft, setDraft] = useState<Record<ChecklistPhase, string>>({ IN: '', OUT: '' });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (q.data) setItems(q.data); }, [q.data]);

  const save = useMutation({
    mutationFn: (next: LeaseChecklistItem[]) => api.put<LeaseChecklistItem[]>(`/rent/leases/${lease.id}/checklist`, { items: next.map(({ id, phase, label, done }) => ({ id, phase, label, done })) }),
    onSuccess: (saved) => { setItems(saved); setErr(null); qc.setQueryData(key, saved); qc.invalidateQueries({ queryKey: ['rent', 'leases'] }); },
    onError: (e) => { setErr(e instanceof ApiError ? e.message : 'Could not save'); if (q.data) setItems(q.data); },
  });
  const commit = (next: LeaseChecklistItem[]) => { setItems(next); save.mutate(next); };

  if (q.isLoading) return <Spinner />;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">{lease.tenantName} · {lease.propertyTitle}</p>
      {PHASES.map(({ key: phase, title }) => {
        const rows = items.filter((i) => i.phase === phase);
        const done = rows.filter((i) => i.done).length;
        return (
          <section key={phase}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{title}</h3>
              <span className="text-xs tabular-nums text-muted">{done} of {rows.length}</span>
            </div>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} /></div>
            <ul className="divide-y divide-line rounded-control border border-line">
              {rows.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={i.done} onChange={() => commit(items.map((x) => x.id === i.id ? { ...x, done: !x.done } : x))} />
                    <span className={`min-w-0 flex-1 ${i.done ? 'text-muted line-through' : 'text-ink'}`}>{i.label}</span>
                  </label>
                  {i.doneAt && <span className="hidden text-xs text-faint sm:block">{new Date(i.doneAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>}
                  <button type="button" aria-label={`Remove ${i.label}`} className="text-faint hover:text-danger" onClick={() => commit(items.filter((x) => x.id !== i.id))}><X size={14} /></button>
                </li>
              ))}
            </ul>
            <form className="mt-2 flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              const label = draft[phase].trim();
              if (!label) return;
              setDraft({ ...draft, [phase]: '' });
              commit([...items, { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, phase, label, done: false, doneAt: null }]);
            }}>
              <Input value={draft[phase]} maxLength={120} placeholder={`Add a ${title.toLowerCase()} item`} onChange={(e) => setDraft({ ...draft, [phase]: e.target.value })} />
              <Button type="submit" variant="secondary"><Plus size={15} /> Add</Button>
            </form>
          </section>
        );
      })}
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}
