import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { PlatformStats } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { platformApi } from './api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { HorizontalBars } from '../components/charts/HorizontalBars';

function SecondaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-5 py-4 first:pl-0 last:pr-0">
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-sm text-muted">{label}</p>
    </div>
  );
}

export function PlatformDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => platformApi.get<PlatformStats>('/stats'),
  });

  return (
    <>
      <PageHeader title="Overview" subtitle="Every agency running on Kaya" />
      <div className="space-y-6 p-8">
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-panel bg-[#14201a] p-6 text-white lg:col-span-1">
                <span className="block h-[3px] w-6 bg-brass" />
                <p className="mt-4 text-sm text-cypress-100/70">Pipeline value under management</p>
                <p className="mt-1 font-display text-4xl font-semibold text-white">
                  {formatKes(data.totalPipelineValue, { compact: true })}
                </p>
              </div>
              <Card className="flex divide-x divide-line p-0 lg:col-span-2">
                <SecondaryStat label="Organizations" value={String(data.totalOrganizations)} />
                <SecondaryStat label="Total users" value={String(data.totalUsers)} />
                <SecondaryStat label="Suspended" value={String(data.suspendedOrganizations)} />
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <Card className="p-5 lg:col-span-2">
                <h2 className="mb-4 font-display text-lg font-semibold text-ink">Organizations by plan</h2>
                <HorizontalBars data={data.byPlan.map((p) => ({ label: p.plan, value: p.count }))} tone="brass" />
              </Card>

              <Card className="p-5 lg:col-span-3">
                <h2 className="mb-4 font-display text-lg font-semibold text-ink">Recently onboarded</h2>
                {data.recentOrganizations.length === 0 ? (
                  <EmptyState title="No agencies yet" body="New organizations will appear here as they sign up." />
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recentOrganizations.map((o) => (
                      <li key={o.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <Link to={`/platform/organizations/${o.id}`} className="block truncate text-sm font-medium text-ink hover:text-cypress-700">
                            {o.name}
                          </Link>
                          <p className="truncate text-xs text-faint">{o.slug}</p>
                        </div>
                        <Badge tone="accent">{o.plan}</Badge>
                        <span className="hidden w-24 shrink-0 text-right text-xs text-faint sm:block">
                          {new Date(o.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
