import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import type { ViewingPage } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  SCHEDULED: 'warn', CONFIRMED: 'accent', COMPLETED: 'ok', CANCELLED: 'danger', NO_SHOW: 'danger',
};

export function ViewingsList() {
  const { data, isLoading } = useQuery({
    queryKey: ['viewings'],
    queryFn: () => api.get<ViewingPage>('/viewings', { pageSize: 50 }),
  });

  return (
    <>
      <PageHeader title="Viewings" subtitle={data ? `${data.total} scheduled` : undefined} />
      <div className="p-8">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState icon={<CalendarClock size={28} />} title="No viewings scheduled" /></Card>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((v) => (
                  <tr key={v.id} className="border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-5 py-3 font-medium text-ink">{v.property.title}</td>
                    <td className="px-5 py-3 text-muted">{v.client?.name ?? v.lead?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">{v.agent.name}</td>
                    <td className="px-5 py-3 text-muted">{new Date(v.scheduledAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[v.status] ?? 'neutral'}>{v.status.replace(/_/g, ' ')}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
