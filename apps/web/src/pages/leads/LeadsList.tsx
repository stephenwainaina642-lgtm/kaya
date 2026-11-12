import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus, Upload } from 'lucide-react';
import type { LeadListItem, Page } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ContactActions } from '../../components/ContactActions';
import { Avatar } from '../../components/ui/Avatar';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NewLeadForm } from '../../forms/NewLeadForm';
import { ImportLeadsForm } from '../../forms/ImportLeadsForm';

const TEMP_TONE: Record<string, 'danger' | 'warn' | 'neutral'> = { HOT: 'danger', WARM: 'warn', COLD: 'neutral' };
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  NEW: 'accent', CONTACTED: 'warn', QUALIFIED: 'ok', NURTURING: 'neutral', WON: 'ok', LOST: 'danger',
};

export function LeadsList() {
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['leads', q],
    queryFn: () => api.get<Page<LeadListItem>>('/leads', { search: q, pageSize: 50 }),
  });

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={data ? `${data.total} total` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              <Upload size={16} /> Import CSV
            </Button>
            <Button onClick={() => setShowNew(true)}>
              <Plus size={16} /> New lead
            </Button>
          </>
        }
      />
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import leads from CSV">
        <ImportLeadsForm onDone={() => setShowImport(false)} />
      </Modal>
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New lead">
        <NewLeadForm onDone={() => setShowNew(false)} />
      </Modal>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-4 flex max-w-sm items-center gap-2 rounded-control border border-line bg-white px-3">
          <Search size={16} className="text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads…"
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
        </div>

        <Card>
          {isLoading ? (
            <Spinner />
          ) : !data || data.items.length === 0 ? (
            <EmptyState title="No leads yet" body="Leads you capture will show up here." />
          ) : (
            <>
            <ul className="divide-y divide-line sm:hidden">
              {data.items.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 p-4">
                  <Avatar name={lead.fullName} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/leads/${lead.id}`} className="block truncate font-medium text-ink">{lead.fullName}</Link>
                    <p className="truncate text-xs text-muted">{lead.phone} · {lead.source.replace(/_/g, ' ').toLowerCase()}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'}>{lead.status}</Badge>
                      <Badge tone={TEMP_TONE[lead.temperature] ?? 'neutral'}>{lead.temperature}</Badge>
                    </div>
                  </div>
                  <ContactActions phone={lead.phone} name={lead.fullName} size={38} />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Temp</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Last contact</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((lead) => (
                  <tr key={lead.id} className="border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={lead.fullName} size={36} />
                        <div className="min-w-0">
                          <Link to={`/leads/${lead.id}`} className="font-medium text-ink hover:text-accent">{lead.fullName}</Link>
                          <div className="flex items-center gap-2"><span className="text-xs text-muted">{lead.phone}</span><ContactActions phone={lead.phone} name={lead.fullName} size={24} /></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{lead.source.replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'}>{lead.status}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={TEMP_TONE[lead.temperature] ?? 'neutral'}>{lead.temperature}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">{lead.assignedAgent?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">
                      {lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleDateString('en-KE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
