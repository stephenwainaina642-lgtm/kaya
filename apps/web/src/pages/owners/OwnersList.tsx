import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import type { OwnerListItem, Page } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

export function OwnersList() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['owners', q],
    queryFn: () => api.get<Page<OwnerListItem>>('/owners', { search: q, pageSize: 50 }),
  });

  return (
    <>
      <PageHeader title="Owners" subtitle={data ? `${data.total} total` : undefined} actions={<Button><Plus size={16} /> New owner</Button>} />
      <div className="p-8">
        <div className="mb-4 flex max-w-sm items-center gap-2 rounded-control border border-line bg-white px-3">
          <Search size={16} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search owners…" className="w-full bg-transparent py-2 text-sm outline-none" />
        </div>
        <Card>
          {isLoading ? (
            <Spinner />
          ) : !data || data.items.length === 0 ? (
            <EmptyState title="No owners yet" />
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Properties</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-5 py-3">
                      <Link to={`/owners/${o.id}`} className="font-medium text-ink hover:text-cypress-700">{o.fullName ?? o.companyName}</Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{o.phone}</td>
                    <td className="px-5 py-3 text-muted">{o.propertyCount}</td>
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
