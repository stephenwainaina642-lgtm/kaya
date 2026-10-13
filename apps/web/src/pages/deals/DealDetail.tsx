import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { OFFER_STATUSES, can } from '@kaya/shared';
import type { DealDetail as DealDetailT } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/PageHeader';
import { NewOfferForm } from '../../forms/NewOfferForm';

export function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showOffer, setShowOffer] = useState(false);
  const { data: deal, isLoading } = useQuery({
    queryKey: ['deal', id],
    queryFn: () => api.get<DealDetailT>(`/deals/${id}`),
  });

  const updateStatus = useMutation({
    mutationFn: (vars: { offerId: string; status: string }) =>
      api.post(`/deals/${id}/offers/${vars.offerId}/status`, { status: vars.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal', id] });
      qc.invalidateQueries({ queryKey: ['deals-board'] });
    },
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
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Offers</h2>
              {user && can(user.role, 'deals:edit') && (
                <Button variant="secondary" onClick={() => setShowOffer(true)}><Plus size={14} /> Record offer</Button>
              )}
            </div>
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
                    {user && can(user.role, 'deals:edit') ? (
                      <select
                        value={o.status}
                        onChange={(e) => updateStatus.mutate({ offerId: o.id, status: e.target.value })}
                        className="rounded-control border border-line bg-surface px-2 py-1 text-xs text-ink"
                      >
                        {OFFER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <Badge>{o.status}</Badge>
                    )}
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
      <Modal open={showOffer} onClose={() => setShowOffer(false)} title="Record offer">
        <NewOfferForm dealId={deal.id} onDone={() => setShowOffer(false)} />
      </Modal>
    </>
  );
}
