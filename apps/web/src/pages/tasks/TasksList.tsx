import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ListChecks, Plus } from 'lucide-react';
import type { TaskPage } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NewTaskForm } from '../../forms/NewTaskForm';

const PRIORITY_TONE: Record<string, 'danger' | 'warn' | 'neutral'> = { HIGH: 'danger', MEDIUM: 'warn', LOW: 'neutral' };

export function TasksList() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.get<TaskPage>('/tasks', { pageSize: 50 }),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.post(`/tasks/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={data ? `${data.counts.open} open · ${data.counts.overdue} overdue` : undefined}
        actions={<Button onClick={() => setShowNew(true)}><Plus size={16} /> New task</Button>}
      />
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New task">
        <NewTaskForm onDone={() => setShowNew(false)} />
      </Modal>
      <div className="p-8">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState icon={<ListChecks size={28} />} title="No tasks" /></Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {data.items.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-4">
                  <button
                    disabled={t.status !== 'OPEN'}
                    onClick={() => setStatus.mutate({ id: t.id, status: 'COMPLETED' })}
                    className="shrink-0 text-faint hover:text-cypress-600 disabled:cursor-default disabled:text-cypress-600"
                  >
                    <CheckCircle2 size={20} fill={t.status === 'COMPLETED' ? 'currentColor' : 'none'} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${t.status === 'COMPLETED' ? 'text-faint line-through' : 'text-ink'}`}>{t.title}</p>
                    <p className="text-xs text-muted">
                      {t.leadId || t.clientId ? 'Linked contact' : 'General'}{t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleDateString('en-KE')}` : ''}
                    </p>
                  </div>
                  <Badge tone={PRIORITY_TONE[t.priority] ?? 'neutral'}>{t.priority}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
