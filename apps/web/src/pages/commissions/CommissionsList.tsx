import { useQuery } from '@tanstack/react-query';
import type { CommissionPage } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  PENDING: 'warn', INVOICED: 'accent', PAID: 'ok', WRITTEN_OFF: 'danger',
};

export function CommissionsList() {
  const { data, isLoading } = useQuery({
    queryKey: ['commissions'],
    queryFn: () => api.get<CommissionPage>('/deals/commissions', { pageSize: 50 }),
  });

  return (
    <>
      <PageHeader title="Commissions" />
      <div className="p-8">
        {data && (
          <div className="mb-6 grid grid-cols-2 gap-4">
            <Card className="p-4"><p className="text-xs text-muted">Outstanding</p><p className="font-display text-xl font-semibold text-ink">{formatKes(data.totalOutstanding, { compact: true })}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Paid</p><p className="font-display text-xl font-semibold text-ink">{formatKes(data.totalPaid, { compact: true })}</p></Card>
          </div>
        )}
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState title="No commissions yet" /></Card>
        ) : (
          <Card>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Deal</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{c.dealName}</p>
                      <p className="text-xs text-muted">{c.dealNumber}</p>
                    </td>
                    <td className="px-5 py-3 text-muted">{c.agent.name}</td>
                    <td className="px-5 py-3 text-ink">{formatKes(c.amount, { compact: true })}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}
      </div>
    </>
  );
}
