import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import type { ClientListItem, Page } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  ACTIVE: 'ok', NURTURING: 'warn', WON: 'ok', LOST: 'danger', INACTIVE: 'neutral',
};

export function ClientsList() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['clients', q],
    queryFn: () => api.get<Page<ClientListItem>>('/clients', { search: q, pageSize: 50 }),
  });

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={data ? `${data.total} total` : undefined}
        actions={<Button><Plus size={16} /> New client</Button>}
      />
      <div className="p-8">
        <div className="mb-4 flex max-w-sm items-center gap-2 rounded-control border border-line bg-white px-3">
          <Search size={16} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className="w-full bg-transparent py-2 text-sm outline-none" />
        </div>
        <Card>
          {isLoading ? (
            <Spinner />
          ) : !data || data.items.length === 0 ? (
            <EmptyState title="No clients yet" body="Qualify a lead to create your first client." />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Last contact</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-5 py-3">
                      <Link to={`/clients/${c.id}`} className="font-medium text-ink hover:text-cypress-700">{c.fullName}</Link>
                      <p className="text-xs text-muted">{c.phone}</p>
                    </td>
                    <td className="px-5 py-3 text-muted">{c.leadType}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge></td>
                    <td className="px-5 py-3 text-muted">{c.assignedAgent?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">{c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString('en-KE') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
