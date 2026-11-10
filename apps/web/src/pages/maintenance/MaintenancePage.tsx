import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Wrench } from 'lucide-react';
import type { MaintenanceItem } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { MaintenanceForm } from '../../forms/MaintenanceForm';
import { currencyCode } from '../../lib/currency';

const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ');
const PRIORITY_TONE = { URGENT: 'danger', HIGH: 'warn', MEDIUM: 'neutral', LOW: 'neutral' } as const;
const STATUS_TONE = { OPEN: 'warn', IN_PROGRESS: 'warn', DONE: 'ok', CANCELLED: 'neutral' } as const;
type Tab = 'active' | 'done' | 'all';
const TABS: [Tab, string][] = [['active', 'Open'], ['done', 'Done'], ['all', 'All']];

export function MaintenancePage() {
  const [tab, setTab] = useState<Tab>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MaintenanceItem | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['maintenance'], queryFn: () => api.get<MaintenanceItem[]>('/maintenance') });

  const shown = (data ?? []).filter((r) =>
    tab === 'all' ? true : tab === 'done' ? r.status === 'DONE' : r.status === 'OPEN' || r.status === 'IN_PROGRESS');
  const openCount = (data ?? []).filter((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS').length;
  const urgent = (data ?? []).filter((r) => r.priority === 'URGENT' && (r.status === 'OPEN' || r.status === 'IN_PROGRESS')).length;

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle={isLoading ? 'Repairs and upkeep across your properties' : `${openCount} open${urgent ? ` · ${urgent} urgent` : ''}`}
        actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> Log repair</Button>}
      />
      <Modal open={creating} onClose={() => setCreating(false)} title="Log a repair">
        <MaintenanceForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Repair details">
        {editing && <MaintenanceForm item={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <div className="px-8 pt-6">
        <div className="mb-6 flex gap-1 border-b border-line">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === key ? 'border-cypress-600 text-cypress-700' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-8 pb-8">
        {isLoading ? <Spinner /> : !shown.length ? (
          <EmptyState
            icon={<Wrench size={22} />}
            title={tab === 'active' ? 'Nothing needs fixing' : 'No repairs here yet'}
            body="Log a repair when a tenant or inspection flags a problem, then track it through to done."
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Priority</th><th className="px-4 py-3">Repair</th><th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Status</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3">Logged</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => setEditing(r)} className="cursor-pointer border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-4 py-3"><Badge tone={PRIORITY_TONE[r.priority]}>{nice(r.priority)}</Badge></td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.title}</p>
                      <p className="text-xs text-muted">{nice(r.category)}{r.chargeToLandlord ? ' · charged to landlord' : ''}</p>
                    </td>
                    <td className="px-4 py-3">{r.propertyTitle}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{nice(r.status)}</Badge></td>
                    <td className="px-4 py-3">{r.vendorName ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {r.actualCost != null ? `${currencyCode()} ${r.actualCost.toLocaleString('en-KE')}` : r.estimatedCost != null ? `~ ${currencyCode()} ${r.estimatedCost.toLocaleString('en-KE')}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{new Date(r.createdAt).toLocaleDateString('en-KE')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
