import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeOff, Eye, Bookmark } from 'lucide-react';
import type { PropertyMatchPage, ShortlistSummary } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api } from '../lib/api';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { MatchVerdictBadge } from './MatchVerdictBadge';

export function PropertyMatchesPanel({ contactType, contactId }: { contactType: 'lead' | 'client'; contactId: string }) {
  const qc = useQueryClient();
  const [showDismissed, setShowDismissed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['matches', contactType, contactId],
    queryFn: () => api.get<PropertyMatchPage>(`/matching/${contactType}s/${contactId}/properties`),
  });

  const { data: shortlists } = useQuery({
    queryKey: ['shortlists', contactId],
    queryFn: () => api.get<{ items: ShortlistSummary[] }>(`/shortlists/clients/${contactId}`),
    enabled: contactType === 'client',
  });

  const dismiss = useMutation({
    mutationFn: ({ propertyId, dismissed }: { propertyId: string; dismissed: boolean }) =>
      api.post(`/matching/clients/${contactId}/properties/${propertyId}/${dismissed ? 'undismiss' : 'dismiss'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches', contactType, contactId] }),
  });

  const addToShortlist = useMutation({
    mutationFn: async ({ propertyId, shortlistId }: { propertyId: string; shortlistId: string }) => {
      let targetId = shortlistId;
      if (targetId === '__new__') {
        const created = await api.post<ShortlistSummary>('/shortlists', { clientId: contactId, title: 'Shortlist' });
        targetId = created.id;
      }
      return api.post(`/shortlists/${targetId}/items`, { propertyId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortlists', contactId] });
      qc.invalidateQueries({ queryKey: ['shortlist-detail'] });
    },
  });

  if (isLoading) return <Card className="p-5"><Spinner /></Card>;
  if (!data || data.items.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">Matching properties</h2>
        <p className="text-sm text-muted">No scored matches yet — add requirements to see suggestions.</p>
      </Card>
    );
  }

  const visible = showDismissed ? data.items : data.items.filter((m) => !m.dismissed);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Matching properties</h2>
        <button onClick={() => setShowDismissed((v) => !v)} className="text-xs text-muted hover:text-ink">
          {showDismissed ? 'Hide dismissed' : 'Show dismissed'}
        </button>
      </div>
      <ul className="divide-y divide-line">
        {visible.map((m) => (
          <li key={m.property.id} className={`flex items-center gap-3 py-3 ${m.dismissed ? 'opacity-50' : ''}`}>
            <div className="min-w-0 flex-1">
              <Link to={`/properties/${m.property.id}`} className="line-clamp-1 text-sm font-medium text-ink hover:text-cypress-700">
                {m.property.title}
              </Link>
              <p className="text-xs text-muted">{m.property.location} · {formatKes(m.property.price, { compact: true })}</p>
            </div>
            <MatchVerdictBadge verdict={m.verdict} score={m.score.total} />
            {contactType === 'client' && (
              <>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) addToShortlist.mutate({ propertyId: m.property.id, shortlistId: e.target.value });
                    e.target.value = '';
                  }}
                  className="rounded-control border border-line bg-white px-1.5 py-1 text-xs text-muted outline-none"
                  title="Add to shortlist"
                >
                  <option value="" disabled><Bookmark size={12} /> Save…</option>
                  {shortlists?.items.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  <option value="__new__">+ New shortlist</option>
                </select>
                <button
                  onClick={() => dismiss.mutate({ propertyId: m.property.id, dismissed: m.dismissed })}
                  className="shrink-0 text-faint hover:text-ink"
                  title={m.dismissed ? 'Undismiss' : 'Dismiss'}
                >
                  {m.dismissed ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
