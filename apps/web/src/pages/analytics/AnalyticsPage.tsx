import { useQuery } from '@tanstack/react-query';
import { Lock, Trophy } from 'lucide-react';
import type { AnalyticsData } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { FunnelChart } from '../../components/charts/FunnelChart';
import { MonthlyBarChart } from '../../components/charts/MonthlyBarChart';

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function AnalyticsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get<AnalyticsData>('/analytics'),
    retry: false,
  });

  return (
    <>
      <PageHeader title="Analytics" subtitle="Funnel, leaderboard, forecast and lead-source ROI" />
      <div className="space-y-6 p-8">
        {isError ? (
          <Card>
            <EmptyState
              icon={<Lock size={28} />}
              title="This feature isn't on your plan"
              body={error instanceof ApiError ? error.message : 'Ask your workspace admin to upgrade to Pro.'}
            />
          </Card>
        ) : isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-4 font-display text-lg font-semibold text-ink">Conversion funnel</h2>
                <FunnelChart data={data.funnel.map((f) => ({ label: f.label, count: f.count }))} />
              </Card>

              <Card className="p-5">
                <h2 className="mb-4 font-display text-lg font-semibold text-ink">Pipeline forecast</h2>
                <p className="mb-3 text-xs text-faint">Weighted by each open deal's probability — a realistic view, not just raw pipeline value.</p>
                {data.forecast.length === 0 ? (
                  <p className="text-sm text-muted">No open deals to forecast.</p>
                ) : (
                  <MonthlyBarChart
                    data={data.forecast.map((f) => ({
                      month: f.label,
                      value: f.weightedValue,
                      displayValue: formatKes(f.weightedValue, { compact: true }),
                    }))}
                  />
                )}
              </Card>
            </div>

            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Trophy size={18} className="text-brass" /> Agent leaderboard
              </h2>
              {data.leaderboard.length === 0 ? (
                <p className="text-sm text-muted">No agents yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                        <th className="py-2 pr-4 font-medium">Rank</th>
                        <th className="py-2 pr-4 font-medium">Agent</th>
                        <th className="py-2 pr-4 font-medium">Deals won</th>
                        <th className="py-2 pr-4 font-medium">Deals lost</th>
                        <th className="py-2 pr-4 font-medium">Win rate</th>
                        <th className="py-2 pr-4 font-medium">Avg. days to close</th>
                        <th className="py-2 font-medium">Commission earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaderboard.map((row) => (
                        <tr key={row.agent.id} className="border-b border-line last:border-0">
                          <td className="py-3 pr-4 text-ink">{RANK_MEDAL[row.rank] ?? `#${row.rank}`}</td>
                          <td className="py-3 pr-4 text-ink">{row.agent.name}</td>
                          <td className="py-3 pr-4 text-muted">{row.dealsWon}</td>
                          <td className="py-3 pr-4 text-muted">{row.dealsLost}</td>
                          <td className="py-3 pr-4 text-muted">{Math.round(row.winRate * 100)}%</td>
                          <td className="py-3 pr-4 text-muted">{row.avgDaysToClose !== null ? `${Math.round(row.avgDaysToClose)}d` : '—'}</td>
                          <td className="py-3 font-medium text-ink">{formatKes(row.commissionEarned, { compact: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-ink">Lead source ROI</h2>
              {data.sourceRoi.length === 0 ? (
                <p className="text-sm text-muted">No leads yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                        <th className="py-2 pr-4 font-medium">Source</th>
                        <th className="py-2 pr-4 font-medium">Total leads</th>
                        <th className="py-2 pr-4 font-medium">Deals won</th>
                        <th className="py-2 pr-4 font-medium">Conversion rate</th>
                        <th className="py-2 font-medium">Commission earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sourceRoi.map((row) => (
                        <tr key={row.source} className="border-b border-line last:border-0">
                          <td className="py-3 pr-4 text-ink">{row.source.replace(/_/g, ' ')}</td>
                          <td className="py-3 pr-4 text-muted">{row.totalLeads}</td>
                          <td className="py-3 pr-4 text-muted">{row.dealsWon}</td>
                          <td className="py-3 pr-4 text-muted">{Math.round(row.conversionRate * 100)}%</td>
                          <td className="py-3 font-medium text-ink">{formatKes(row.commissionEarned, { compact: true })}</td>
                        </tr>
                      ))}
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
