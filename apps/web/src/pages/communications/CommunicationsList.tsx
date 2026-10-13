import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, MessageCircle, Mail, MessageSquareText, Users as UsersIcon, StickyNote, Plus } from 'lucide-react';
import { can } from '@kaya/shared';
import type { CommunicationPage } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { LogCommunicationForm } from '../../forms/LogCommunicationForm';

const CHANNEL_ICON: Record<string, any> = {
  CALL: Phone, WHATSAPP: MessageCircle, EMAIL: Mail, SMS: MessageSquareText, MEETING: UsersIcon, NOTE: StickyNote,
};

export function CommunicationsList() {
  const { user } = useAuth();
  const [showLog, setShowLog] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['communications'],
    queryFn: () => api.get<CommunicationPage>('/communications', { pageSize: 50 }),
  });

  return (
    <>
      <PageHeader
        title="Communications"
        subtitle={data ? `${data.total} logged` : undefined}
        actions={
          user && can(user.role, 'communications:create') ? (
            <Button onClick={() => setShowLog(true)}><Plus size={16} /> Log communication</Button>
          ) : undefined
        }
      />
      <div className="p-8">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState title="No communications logged" /></Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {data.items.map((c) => {
                const Icon = CHANNEL_ICON[c.channel] ?? StickyNote;
                return (
                  <li key={c.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-cypress-50 text-cypress-700">
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">
                        {c.contact?.name ?? 'Unknown contact'} <span className="font-normal text-muted">· {c.direction.toLowerCase()} {c.channel.toLowerCase()}</span>
                      </p>
                      {c.body && <p className="text-sm text-muted">{c.body}</p>}
                      <p className="mt-1 text-xs text-faint">{new Date(c.occurredAt).toLocaleString('en-KE')}{c.user ? ` · ${c.user.name}` : ''}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Log communication">
        <LogCommunicationForm onDone={() => setShowLog(false)} />
      </Modal>
    </>
  );
}
