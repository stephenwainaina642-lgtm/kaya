import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ListChecks } from 'lucide-react';
import type { FollowUpPage } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';

const PRIORITY_TONE: Record<string, 'danger' | 'warn' | 'neutral'> = { HIGH: 'danger', MEDIUM: 'warn', LOW: 'neutral' };

export function FollowUpsList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['followups'],
    queryFn: () => api.get<FollowUpPage>('/follow-ups', { pageSize: 50 }),
  });
  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/follow-ups/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followups'] }),
  });

  return (
    <>
      <PageHeader title="Follow-ups" subtitle={data ? `${data.counts.overdue} overdue · ${data.counts.today} today` : undefined} />
      <div className="p-8">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState icon={<ListChecks size={28} />} title="No follow-ups" body="Follow-ups you schedule from leads or clients show up here." /></Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {data.items.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-5 py-4">
                  <button
                    disabled={f.status !== 'PENDING'}
                    onClick={() => complete.mutate(f.id)}
                    className="shrink-0 text-faint hover:text-cypress-600 disabled:cursor-default disabled:text-cypress-600"
                    title="Mark complete"
                  >
                    <CheckCircle2 size={20} fill={f.status === 'COMPLETED' ? 'currentColor' : 'none'} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${f.status === 'COMPLETED' ? 'text-faint line-through' : 'text-ink'}`}>{f.title}</p>
                    <p className="text-xs text-muted">{f.contactName} · due {new Date(f.dueAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                  <Badge tone={PRIORITY_TONE[f.priority] ?? 'neutral'}>{f.priority}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
