import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DealBoard } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

export function DealsBoard() {
  const { data, isLoading } = useQuery({
    queryKey: ['deals-board'],
    queryFn: () => api.get<DealBoard>('/deals/board'),
  });

  return (
    <>
      <PageHeader title="Deals" subtitle="Pipeline board" />
      <div className="p-8">
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {data.stages.map((s) => (
              <div key={s.id} className="w-72 shrink-0">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-ink">{s.name}</h3>
                  <span className="text-xs text-muted">{s.deals.length}</span>
                </div>
                <p className="mb-3 px-1 text-xs text-muted">{formatKes(s.totalValue, { compact: true })}</p>
                <div className="space-y-3">
                  {s.deals.map((d) => (
                    <Link key={d.id} to={`/deals/${d.id}`}>
                      <Card className="p-3 transition hover:-translate-y-0.5 hover:shadow-lg">
                        <p className="mb-1 line-clamp-1 text-sm font-medium text-ink">{d.name}</p>
                        <p className="mb-2 text-xs text-muted">{d.clientName}</p>
                        <p className="font-display text-sm font-semibold text-cypress-700">
                          {formatKes(d.value, { compact: true })}
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
