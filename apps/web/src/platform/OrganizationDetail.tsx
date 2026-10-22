import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PLANS } from '@kaya/shared';
import type { PlatformOrgDetail } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { platformApi } from './api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Avatar } from '../components/ui/Avatar';

export function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: org, isLoading } = useQuery({
    queryKey: ['platform-organization', id],
    queryFn: () => platformApi.get<PlatformOrgDetail>(`/organizations/${id}`),
  });

  const update = useMutation({
    mutationFn: (patch: { plan?: string; suspended?: boolean }) => platformApi.patch(`/organizations/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-organization', id] });
      qc.invalidateQueries({ queryKey: ['platform-organizations'] });
      qc.invalidateQueries({ queryKey: ['platform-stats'] });
    },
  });

  if (isLoading || !org) return (<><PageHeader title="Organization" /><Spinner /></>);

  return (
    <>
      <PageHeader
        title={org.name}
        subtitle={org.slug}
        actions={<Link to="/platform/organizations" className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> Back</Link>}
      />
      <div className="grid grid-cols-1 gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Team ({org.users.length})</h2>
            <ul className="divide-y divide-line">
              {org.users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-3">
                  <Avatar name={u.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{u.name}</p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                  <Badge>{u.role.replace('_', ' ')}</Badge>
                  <span className="w-28 shrink-0 text-right text-xs text-faint">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-KE') : 'Never logged in'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex divide-x divide-line p-0">
            {[
              ['Leads', org.counts.leads],
              ['Clients', org.counts.clients],
              ['Properties', org.counts.properties],
              ['Deals', org.counts.deals],
            ].map(([label, value]) => (
              <div key={label as string} className="flex-1 px-5 py-4 first:pl-5 last:pr-5">
                <p className="font-display text-2xl font-semibold text-ink">{value}</p>
                <p className="mt-0.5 text-sm text-muted">{label}</p>
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-6">
          <div className="rounded-panel bg-[#14201a] p-6 text-white">
            <div className="flex items-center justify-between">
              <span className="block h-[3px] w-6 bg-brass" />
              {org.suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="ok">Active</Badge>}
            </div>
            <p className="mt-4 text-sm text-cypress-100/70">Total pipeline value</p>
            <p className="mt-1 font-display text-3xl font-semibold text-white">
              {formatKes(org.pipelineValue, { compact: true })}
            </p>
          </div>

          <Card className="p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Currency</dt><dd className="text-ink">{org.currency}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Timezone</dt><dd className="text-ink">{org.timezone}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Phone</dt><dd className="text-ink">{org.phone ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Created</dt><dd className="text-ink">{new Date(org.createdAt).toLocaleDateString('en-KE')}</dd></div>
            </dl>

            <div className="mt-5 border-t border-line pt-4">
              <label className="mb-1 block text-xs font-medium text-muted">Plan</label>
              <Select
                value={org.plan}
                onChange={(e) => update.mutate({ plan: e.target.value })}
                disabled={update.isPending}
              >
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>

            <Button
              variant={org.suspended ? 'primary' : 'danger'}
              disabled={update.isPending}
              onClick={() => update.mutate({ suspended: !org.suspended })}
              className="mt-4 w-full"
            >
              {org.suspended ? 'Reactivate workspace' : 'Suspend workspace'}
            </Button>
            {!org.suspended && (
              <p className="mt-2 text-xs text-faint">Suspending blocks sign-in for every user at this agency. Data is kept.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
