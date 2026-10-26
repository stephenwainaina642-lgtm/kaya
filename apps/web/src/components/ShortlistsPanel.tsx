import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Trash2, ChevronDown, ChevronRight, Plus, Lock } from 'lucide-react';
import type { ShortlistSummary, ShortlistDetail } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

function ShortlistRow({ summary }: { summary: ShortlistSummary }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: detail } = useQuery({
    queryKey: ['shortlist-detail', summary.id],
    queryFn: () => api.get<ShortlistDetail>(`/shortlists/${summary.id}`),
    enabled: open,
  });

  const removeItem = useMutation({
    mutationFn: (propertyId: string) => api.del(`/shortlists/${summary.id}/items/${propertyId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortlist-detail', summary.id] });
      qc.invalidateQueries({ queryKey: ['shortlists', summary.clientId] });
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/shortlists/${summary.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shortlists', summary.clientId] }),
  });

  const shareUrl = `${window.location.origin}/share/${summary.shareToken}`;

  return (
    <div className="border-b border-line last:border-0">
      <div className="flex items-center gap-2 py-3">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown size={14} className="shrink-0 text-faint" /> : <ChevronRight size={14} className="shrink-0 text-faint" />}
          <span className="truncate text-sm font-medium text-ink">{summary.title}</span>
          <span className="shrink-0 text-xs text-muted">{summary.itemCount} {summary.itemCount === 1 ? 'property' : 'properties'}</span>
        </button>
        <button
          onClick={() => { navigator.clipboard.writeText(shareUrl).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex shrink-0 items-center gap-1 text-xs text-cypress-700 hover:underline"
          title="Copy share link"
        >
          <Link2 size={13} /> {copied ? 'Copied!' : 'Share link'}
        </button>
        <button onClick={() => remove.mutate()} className="shrink-0 text-faint hover:text-danger" title="Delete shortlist">
          <Trash2 size={14} />
        </button>
      </div>
      {open && (
        <div className="pb-3 pl-6">
          {!detail || detail.items.length === 0 ? (
            <p className="text-xs text-muted">No properties added yet.</p>
          ) : (
            <ul className="space-y-2">
              {detail.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-ink">{item.property.title}</span>
                  <span className="shrink-0 text-xs text-muted">{formatMoney(item.property.price, item.property.currency, { compact: true })}</span>
                  <button onClick={() => removeItem.mutate(item.property.id)} className="shrink-0 text-faint hover:text-danger">
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function ShortlistsPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const { data, isError, error } = useQuery({
    queryKey: ['shortlists', clientId],
    queryFn: () => api.get<{ items: ShortlistSummary[] }>(`/shortlists/clients/${clientId}`),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => api.post('/shortlists', { clientId, title: title || 'Shortlist' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortlists', clientId] });
      setTitle('');
      setCreating(false);
    },
  });

  if (isError) {
    return (
      <Card className="p-5">
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold text-ink"><Lock size={16} /> Shortlists</h2>
        <p className="text-sm text-muted">{error instanceof ApiError ? error.message : "This feature isn't on your plan."}</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Shortlists</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1 text-xs text-cypress-700 hover:underline">
            <Plus size={13} /> New
          </button>
        )}
      </div>
      {creating && (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mb-3 flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shortlist name" autoFocus />
          <Button type="submit" disabled={create.isPending}>Add</Button>
        </form>
      )}
      {!data || data.items.length === 0 ? (
        <p className="text-sm text-muted">No shortlists yet. Save matching properties to build one, or create one above.</p>
      ) : (
        <div>{data.items.map((s) => <ShortlistRow key={s.id} summary={s} />)}</div>
      )}
    </Card>
  );
}
