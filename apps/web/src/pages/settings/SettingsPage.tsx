import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="p-8">
        <Card className="max-w-lg p-5">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Your account</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Name</dt><dd className="text-ink">{user?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email</dt><dd className="text-ink">{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Role</dt><dd className="text-ink">{user?.role.replace('_', ' ')}</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
