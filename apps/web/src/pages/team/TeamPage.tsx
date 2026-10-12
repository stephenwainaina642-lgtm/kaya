import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import type { TeamMember } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { can } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { InviteMemberForm } from '../../forms/InviteMemberForm';

export function TeamPage() {
  const { user } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get<{ items: TeamMember[] }>('/team/members'),
  });

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={data ? `${data.items.length} members` : undefined}
        actions={
          user && can(user.role, 'team:create') ? (
            <Button onClick={() => setShowInvite(true)}><UserPlus size={16} /> Add member</Button>
          ) : undefined
        }
      />
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Add team member">
        <InviteMemberForm onDone={() => setShowInvite(false)} />
      </Modal>
      <div className="p-8">
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((m) => (
              <Card key={m.id} className="flex items-center gap-3 p-4">
                <Avatar name={m.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{m.name}</p>
                  <p className="truncate text-xs text-muted">{m.jobTitle ?? m.role.replace('_', ' ')}</p>
                </div>
                <Badge>{m.role.replace('_', ' ')}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
