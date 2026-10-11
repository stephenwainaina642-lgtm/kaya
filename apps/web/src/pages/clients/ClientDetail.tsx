import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, Mail, MessageCircle } from 'lucide-react';
import type { ClientDetail as ClientDetailT, TimelinePage } from '@kaya/shared';
import { whatsappLink } from '@kaya/shared';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { PageHeader } from '../../components/PageHeader';
import { PropertyMatchesPanel } from '../../components/PropertyMatchesPanel';
import { ShortlistsPanel } from '../../components/ShortlistsPanel';

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<ClientDetailT>(`/clients/${id}`),
  });
  const { data: timeline } = useQuery({
    queryKey: ['client-timeline', id],
    queryFn: () => api.get<TimelinePage>(`/clients/${id}/timeline`),
    enabled: !!client,
  });

  if (isLoading || !client) {
    return (<><PageHeader title="Client" /><Spinner /></>);
  }

  return (
    <>
      <PageHeader
        title={client.fullName}
        subtitle={client.leadType}
        actions={<Link to="/clients" className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> Back</Link>}
      />
      <div className="grid grid-cols-1 gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Activity timeline</h2>
            {!timeline || timeline.items.length === 0 ? (
              <p className="text-sm text-muted">No activity logged yet.</p>
            ) : (
              <ul className="space-y-4">
                {timeline.items.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-line pl-4">
                    <p className="text-sm font-medium text-ink">{entry.title}</p>
                    {entry.body && <p className="text-sm text-muted">{entry.body}</p>}
                    <p className="mt-1 text-xs text-faint">{new Date(entry.occurredAt).toLocaleString('en-KE')}{entry.actor ? ` · ${entry.actor.name}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <PropertyMatchesPanel contactType="client" contactId={client.id} />
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Contact</h2>
            <Badge>{client.status}</Badge>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2 text-ink"><Phone size={14} className="text-faint" /> {client.phone}</li>
              {client.email && <li className="flex items-center gap-2 text-ink"><Mail size={14} className="text-faint" /> {client.email}</li>}
            </ul>
            <a
              href={whatsappLink(client.whatsapp ?? client.phone, `Hi ${client.fullName.split(' ')[0]}, `)}
              target="_blank" rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-2 rounded-control bg-cypress-600 py-2 text-sm font-medium text-white hover:bg-cypress-700"
            >
              <MessageCircle size={16} /> Message on WhatsApp
            </a>
          </Card>
          <ShortlistsPanel clientId={client.id} />
        </div>
      </div>
    </>
  );
}
