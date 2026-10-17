import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Lock } from 'lucide-react';
import type { AuditLogPage } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'created',
  UPDATE: 'updated',
  DELETE: 'deleted',
};

export function AuditLog() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => api.get<AuditLogPage>('/audit', { pageSize: 50 }),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle={data ? `${data.total} events` : undefined}
      />
      <div className="p-8">
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <Card>
            <EmptyState
              icon={<Lock size={28} />}
              title="This feature isn't on your plan"
              body={error instanceof ApiError ? error.message : 'Ask your workspace admin to upgrade to see the audit log.'}
            />
          </Card>
        ) : !data || data.items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ShieldCheck size={28} />}
              title="No activity recorded yet"
              body="Every create, edit and delete across your workspace will show up here, newest first."
            />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {data.items.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-5 py-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-cypress-50 text-cypress-700">
                    <ShieldCheck size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {e.actor?.name ?? 'System'}{' '}
                      <span className="font-normal text-muted">
                        {ACTION_LABEL[e.action] ?? e.action.toLowerCase()} {e.entityType.toLowerCase()}
                      </span>
                    </p>
                    {e.summary && <p className="text-sm text-muted">{e.summary}</p>}
                    <p className="mt-1 text-xs text-faint">{new Date(e.createdAt).toLocaleString('en-KE')}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
