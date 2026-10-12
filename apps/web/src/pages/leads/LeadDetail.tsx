import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Phone, Mail, MessageCircle, Pencil } from 'lucide-react';
import type { LeadDetail as LeadDetailT, TimelinePage } from '@kaya/shared';
import { whatsappLink } from '@kaya/shared';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/PageHeader';
import { PropertyMatchesPanel } from '../../components/PropertyMatchesPanel';
import { EditLeadForm } from '../../forms/EditLeadForm';

export function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const [showEdit, setShowEdit] = useState(false);
  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get<LeadDetailT>(`/leads/${id}`),
  });
  const { data: timeline } = useQuery({
    queryKey: ['lead-timeline', id],
    queryFn: () => api.get<TimelinePage>(`/leads/${id}/timeline`),
    enabled: !!lead,
  });

  if (isLoading || !lead) {
    return (
      <>
        <PageHeader title="Lead" />
        <Spinner />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={lead.fullName}
        subtitle={`${lead.leadType} · ${lead.source.replace(/_/g, ' ')}`}
        actions={
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowEdit(true)}><Pencil size={14} /> Edit</Button>
            <Link to="/leads" className="flex items-center gap-1 text-sm text-muted hover:text-ink">
              <ArrowLeft size={16} /> Back
            </Link>
          </div>
        }
      />
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit lead">
        <EditLeadForm lead={lead} onDone={() => setShowEdit(false)} />
      </Modal>
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
                    <p className="mt-1 text-xs text-faint">
                      {new Date(entry.occurredAt).toLocaleString('en-KE')}
                      {entry.actor ? ` · ${entry.actor.name}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {lead.requirements && (
            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">Requirements</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted">Intent</dt>
                <dd className="text-ink">{lead.requirements.intent ?? '—'}</dd>
                <dt className="text-muted">Budget</dt>
                <dd className="text-ink">
                  {lead.requirements.budgetMin ?? '—'} – {lead.requirements.budgetMax ?? '—'}
                </dd>
                <dt className="text-muted">Locations</dt>
                <dd className="text-ink">{lead.requirements.locations.join(', ') || '—'}</dd>
                <dt className="text-muted">Bedrooms min</dt>
                <dd className="text-ink">{lead.requirements.bedroomsMin ?? '—'}</dd>
              </dl>
            </Card>
          )}
          <PropertyMatchesPanel contactType="lead" contactId={lead.id} />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Contact</h2>
            <div className="mb-3 flex gap-2">
              <Badge>{lead.status}</Badge>
              <Badge tone="warn">{lead.temperature}</Badge>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2 text-ink">
                <Phone size={14} className="text-faint" /> {lead.phone}
              </li>
              {lead.email && (
                <li className="flex items-center gap-2 text-ink">
                  <Mail size={14} className="text-faint" /> {lead.email}
                </li>
              )}
            </ul>
            <a
              href={whatsappLink(lead.whatsapp ?? lead.phone, `Hi ${lead.fullName.split(' ')[0]}, `)}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center justify-center gap-2 rounded-control bg-cypress-600 py-2 text-sm font-medium text-white hover:bg-cypress-700"
            >
              <MessageCircle size={16} /> Message on WhatsApp
            </a>
          </Card>
          {lead.assignedAgent && (
            <Card className="p-5">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">Assigned agent</h2>
              <p className="text-sm text-ink">{lead.assignedAgent.name}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
