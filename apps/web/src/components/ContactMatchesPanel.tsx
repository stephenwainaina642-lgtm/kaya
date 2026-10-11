import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PersonMatchPage } from '@kaya/shared';
import { api } from '../lib/api';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { MatchVerdictBadge } from './MatchVerdictBadge';

export function ContactMatchesPanel({ propertyId }: { propertyId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['matches-for-property', propertyId],
    queryFn: () => api.get<PersonMatchPage>(`/matching/properties/${propertyId}/contacts`),
  });

  if (isLoading) return <Card className="p-5"><Spinner /></Card>;
  if (!data || data.items.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="mb-2 font-display text-lg font-semibold text-ink">Matching leads & clients</h2>
        <p className="text-sm text-muted">No scored matches yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">Matching leads & clients</h2>
      <ul className="divide-y divide-line">
        {data.items.map((m) => (
          <li key={`${m.contact.kind}-${m.contact.id}`} className="flex items-center justify-between gap-3 py-3">
            <Link
              to={`/${m.contact.kind === 'lead' ? 'leads' : 'clients'}/${m.contact.id}`}
              className="text-sm font-medium text-ink hover:text-cypress-700"
            >
              {m.contact.name}
              <span className="ml-2 text-xs font-normal text-faint">{m.contact.kind}</span>
            </Link>
            <MatchVerdictBadge verdict={m.verdict} score={m.score.total} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
