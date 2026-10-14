import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { PlatformOrgPage } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { platformApi } from './api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Input } from '../components/ui/Input';

export function OrganizationsList() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: () => platformApi.get<PlatformOrgPage>('/organizations'),
  });

  const items = (data?.items ?? []).filter(
    (o) => !q.trim() || o.name.toLowerCase().includes(q.trim().toLowerCase()) || o.slug.includes(q.trim().toLowerCase()),
  );

  return (
    <>
      <PageHeader title="Organizations" subtitle={data ? `${data.total} agencies on Kaya` : undefined} />
      <div className="p-8">
        <div className="mb-4 max-w-xs">
          <Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                    <th className="px-5 py-3 font-medium">Organization</th>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 font-medium">Users</th>
                    <th className="px-5 py-3 font-medium">Deals</th>
                    <th className="px-5 py-3 font-medium">Pipeline value</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr key={o.id} className="border-b border-line last:border-0 hover:bg-sunk">
                      <td className="px-5 py-3">
                        <Link to={`/platform/organizations/${o.id}`} className="font-medium text-ink hover:underline">
                          {o.name}
                        </Link>
                        <p className="text-xs text-faint">{o.slug}</p>
                      </td>
                      <td className="px-5 py-3"><Badge tone="accent">{o.plan}</Badge></td>
                      <td className="px-5 py-3 text-muted">{o.userCount}</td>
                      <td className="px-5 py-3 text-muted">{o.dealCount}</td>
                      <td className="px-5 py-3 text-muted">{formatKes(o.pipelineValue, { compact: true })}</td>
                      <td className="px-5 py-3">
                        {o.suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="ok">Active</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
