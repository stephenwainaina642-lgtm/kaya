import { useQuery } from '@tanstack/react-query';
import { Building2, Users, TrendingUp, Ban } from 'lucide-react';
import type { PlatformStats } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { platformApi } from './api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { HorizontalBars } from '../components/charts/HorizontalBars';

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-control bg-cypress-50 text-cypress-700">
        <Icon size={18} />
      </div>
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </Card>
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi icon={Building2} label="Organizations" value={String(data.totalOrganizations)} />
              <Kpi icon={Users} label="Total users" value={String(data.totalUsers)} />
              <Kpi icon={TrendingUp} label="Platform pipeline value" value={formatKes(data.totalPipelineValue, { compact: true })} />
              <Kpi icon={Ban} label="Suspended" value={String(data.suspendedOrganizations)} />
            </div>
            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">Organizations by plan</h2>
              <HorizontalBars data={data.byPlan.map((p) => ({ label: p.plan, value: p.count }))} tone="brass" />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
