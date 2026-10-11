import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { DealDetail as DealDetailT } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { PageHeader } from '../../components/PageHeader';

export function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal', id],
    queryFn: () => api.get<DealDetailT>(`/deals/${id}`),
  });

  if (isLoading || !deal) return (<><PageHeader title="Deal" /><Spinner /></>);

  return (
    <>
      <PageHeader
        title={deal.name}
        subtitle={deal.dealNumber}
        actions={<Link to="/deals" className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> Back</Link>}
      />
      <div className="grid grid-cols-1 gap-6 p-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Offers</h2>
            {deal.offers.length === 0 ? (
              <p className="text-sm text-muted">No offers recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {deal.offers.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">{formatKes(o.amount, { compact: true })} · {o.madeBy}</p>
                      <p className="text-xs text-muted">{new Date(o.offeredAt).toLocaleDateString('en-KE')}</p>
                    </div>
                    <Badge>{o.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Commissions</h2>
            {deal.commissions.length === 0 ? (
              <p className="text-sm text-muted">No commission records yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {deal.commissions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">{c.agent.name} · {c.sharePercent}%</p>
                      <p className="text-xs text-muted">{formatKes(c.amount, { compact: true })}</p>
                    </div>
                    <Badge tone={c.status === 'PAID' ? 'ok' : 'warn'}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <Badge>{deal.status}</Badge>
            <p className="mt-3 font-display text-2xl font-semibold text-cypress-700">
              {formatKes(deal.finalPrice ?? deal.offerPrice ?? deal.dealValue, { compact: true })}
            </p>
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Stage</dt><dd className="text-ink">{deal.stage.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Client</dt><dd className="text-ink">{deal.client.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Agent</dt><dd className="text-ink">{deal.agent.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Commission</dt><dd className="text-ink">{formatKes(deal.commissionAmount ?? 0, { compact: true })}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
