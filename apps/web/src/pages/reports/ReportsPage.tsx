import { useQuery } from '@tanstack/react-query';
import type { DashboardData } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

export function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  });

  return (
    <>
      <PageHeader title="Reports" subtitle="Agency performance overview" />
      <div className="space-y-6 p-8">
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">Lead sources</h2>
              <ul className="space-y-2">
                {data.leadSources.map((s) => (
                  <li key={s.source} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{s.source.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-ink">{s.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">Agent performance</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                    <th className="py-2 font-medium">Agent</th>
                    <th className="py-2 font-medium">Active leads</th>
                    <th className="py-2 font-medium">Deals won</th>
                    <th className="py-2 font-medium">Commission earned</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agentPerformance.map((a) => (
                    <tr key={a.agent.id} className="border-b border-line last:border-0">
                      <td className="py-2 text-ink">{a.agent.name}</td>
                      <td className="py-2 text-muted">{a.activeLeads}</td>
                      <td className="py-2 text-muted">{a.dealsWon}</td>
                      <td className="py-2 text-ink">{formatKes(a.commissionEarned, { compact: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
