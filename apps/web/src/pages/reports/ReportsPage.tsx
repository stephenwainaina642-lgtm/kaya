import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Handshake, Users, Building2, CalendarClock, Award } from 'lucide-react';
import type { DashboardData } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { HorizontalBars } from '../../components/charts/HorizontalBars';
import { MonthlyBarChart } from '../../components/charts/MonthlyBarChart';

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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi icon={TrendingUp} label="Pipeline value" value={formatKes(data.kpis.pipelineValue, { compact: true })} />
              <Kpi icon={Handshake} label="Deals in progress" value={String(data.kpis.dealsInProgress)} />
              <Kpi icon={Award} label="Commission this month" value={formatKes(data.kpis.commissionsEarnedThisMonth, { compact: true })} />
              <Kpi icon={CalendarClock} label="Deals won this month" value={String(data.kpis.wonDealsThisMonth)} />
              <Kpi icon={Users} label="Active leads" value={String(data.kpis.activeLeads)} />
              <Kpi icon={Building2} label="Active clients" value={String(data.kpis.activeClients)} />
              <Kpi icon={CalendarClock} label="Viewings this week" value={String(data.kpis.viewingsThisWeek)} />
              <Kpi
                icon={TrendingUp}
                label="Avg. deal commission"
                value={
                  data.agentPerformance.length > 0
                    ? formatKes(
                        data.agentPerformance.reduce((s, a) => s + a.commissionEarned, 0) /
                          Math.max(data.agentPerformance.reduce((s, a) => s + a.dealsWon, 0), 1),
                        { compact: true },
                      )
                    : formatKes(0)
                }
              />
            </div>

            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">Commission earned by month</h2>
              {data.revenueTrend.every((p) => p.commissionEarned === 0) ? (
                <p className="text-sm text-muted">No commission history yet.</p>
              ) : (
                <MonthlyBarChart
                  data={data.revenueTrend.map((p) => ({
                    month: p.month,
                    value: p.commissionEarned,
                    displayValue: formatKes(p.commissionEarned, { compact: true }),
                  }))}
                />
              )}
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-4 font-display text-lg font-semibold text-ink">Lead pipeline</h2>
                <HorizontalBars
                  data={data.pipeline.map((s) => ({ label: s.status.replace(/_/g, ' '), value: s.count }))}
                />
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 font-display text-lg font-semibold text-ink">Lead sources</h2>
                <HorizontalBars
                  tone="brass"
                  data={data.leadSources.map((s) => ({ label: s.source.replace(/_/g, ' '), value: s.count }))}
                />
              </Card>
            </div>

            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">Agent performance</h2>
              {data.agentPerformance.length === 0 ? (
                <p className="text-sm text-muted">No agent activity yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                        <th className="py-2 pr-4 font-medium">Agent</th>
                        <th className="py-2 pr-4 font-medium">Active leads</th>
                        <th className="py-2 pr-4 font-medium">Deals won</th>
                        <th className="py-2 pr-4 font-medium">Commission earned</th>
                        <th className="py-2 font-medium">Share of commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const maxCommission = Math.max(...data.agentPerformance.map((a) => a.commissionEarned), 1);
                        return [...data.agentPerformance]
                          .sort((a, b) => b.commissionEarned - a.commissionEarned)
                          .map((a) => (
                            <tr key={a.agent.id} className="border-b border-line last:border-0">
                              <td className="py-3 pr-4 text-ink">{a.agent.name}</td>
                              <td className="py-3 pr-4 text-muted">{a.activeLeads}</td>
                              <td className="py-3 pr-4 text-muted">{a.dealsWon}</td>
                              <td className="py-3 pr-4 font-medium text-ink">{formatKes(a.commissionEarned, { compact: true })}</td>
                              <td className="py-3">
                                <div className="h-2 w-32 overflow-hidden rounded-full bg-ground">
                                  <div
                                    className="h-full rounded-full bg-cypress-600"
                                    style={{ width: `${Math.max((a.commissionEarned / maxCommission) * 100, a.commissionEarned > 0 ? 3 : 0)}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
