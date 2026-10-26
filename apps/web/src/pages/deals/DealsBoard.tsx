import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Lock } from 'lucide-react';
import type { DealBoard } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NewDealForm } from '../../forms/NewDealForm';

export function DealsBoard() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'KES';
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['deals-board'],
    queryFn: () => api.get<DealBoard>('/deals/board'),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Deals"
        subtitle="Pipeline board"
        actions={!isError ? <Button onClick={() => setShowNew(true)}><Plus size={16} /> New deal</Button> : undefined}
      />
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New deal" width="max-w-xl">
        <NewDealForm onDone={() => setShowNew(false)} />
      </Modal>
      <div className="p-8">
        {isError ? (
          <Card>
            <EmptyState
              icon={<Lock size={28} />}
              title="This feature isn't on your plan"
              body={error instanceof ApiError ? error.message : 'Ask your workspace admin to upgrade.'}
            />
          </Card>
        ) : isLoading || !data ? (
          <Spinner />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {data.stages.map((s) => (
              <div key={s.id} className="w-72 shrink-0">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-ink">{s.name}</h3>
                  <span className="text-xs text-muted">{s.deals.length}</span>
                </div>
                <p className="mb-3 px-1 text-xs text-muted">{formatMoney(s.totalValue, currency, { compact: true })}</p>
                <div className="space-y-3">
                  {s.deals.map((d) => (
                    <Link key={d.id} to={`/deals/${d.id}`}>
                      <Card className="p-3 transition hover:-translate-y-0.5 hover:shadow-lg">
                        <p className="mb-1 line-clamp-1 text-sm font-medium text-ink">{d.name}</p>
                        <p className="mb-2 text-xs text-muted">{d.clientName}</p>
                        <p className="font-display text-sm font-semibold text-cypress-700">
                          {formatMoney(d.value, currency, { compact: true })}
                        </p>
                        {d.isStalled && <p className="mt-1 text-xs font-medium text-danger">Stalled</p>}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
