import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Check, X } from 'lucide-react';
import type { ViewingPage, ViewingRequest, Page } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NewViewingForm } from '../../forms/NewViewingForm';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  SCHEDULED: 'warn', CONFIRMED: 'accent', COMPLETED: 'ok', CANCELLED: 'danger', NO_SHOW: 'danger',
};

const REQUEST_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  PENDING: 'warn', CONFIRMED: 'ok', DECLINED: 'danger',
};

export function ViewingsList() {
  const [tab, setTab] = useState<'scheduled' | 'requests'>('scheduled');
  const [showNew, setShowNew] = useState(false);
  const { data: pendingCount } = useQuery({
    queryKey: ['viewing-requests', 'PENDING'],
    queryFn: () => api.get<Page<ViewingRequest>>('/viewing-requests', { status: 'PENDING', pageSize: 1 }),
    select: (p) => p.total,
  });

  return (
    <>
      <PageHeader
        title="Viewings"
        subtitle="Scheduled viewings and client-requested times"
        actions={tab === 'scheduled' ? <Button onClick={() => setShowNew(true)}><Plus size={16} /> New viewing</Button> : undefined}
      />
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New viewing">
        <NewViewingForm onDone={() => setShowNew(false)} />
      </Modal>
      <div className="px-8 pt-6">
        <div className="mb-6 flex gap-1 border-b border-line">
          <button
            onClick={() => setTab('scheduled')}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === 'scheduled' ? 'border-cypress-600 text-cypress-700' : 'border-transparent text-muted hover:text-ink'}`}
          >
            Scheduled
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === 'requests' ? 'border-cypress-600 text-cypress-700' : 'border-transparent text-muted hover:text-ink'}`}
          >
            Requests
            {!!pendingCount && <Badge tone="warn">{pendingCount}</Badge>}
          </button>
        </div>
      </div>
      <div className="px-8 pb-8">
        {tab === 'scheduled' ? <ScheduledTab /> : <RequestsTab />}
      </div>
    </>
  );
}

function ScheduledTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['viewings'],
    queryFn: () => api.get<ViewingPage>('/viewings', { pageSize: 50 }),
  });

  if (isLoading) return <Spinner />;
  if (!data || data.items.length === 0) return <Card><EmptyState icon={<CalendarClock size={28} />} title="No viewings scheduled" /></Card>;

  return (
    <Card>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
            <th className="px-5 py-3 font-medium">Property</th>
            <th className="px-5 py-3 font-medium">Contact</th>
            <th className="px-5 py-3 font-medium">Agent</th>
            <th className="px-5 py-3 font-medium">When</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((v) => (
            <tr key={v.id} className="border-b border-line last:border-0 hover:bg-sunk">
              <td className="px-5 py-3 font-medium text-ink">{v.property.title}</td>
              <td className="px-5 py-3 text-muted">{v.client?.name ?? v.lead?.name ?? '—'}</td>
              <td className="px-5 py-3 text-muted">{v.agent.name}</td>
              <td className="px-5 py-3 text-muted">{new Date(v.scheduledAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td className="px-5 py-3"><Badge tone={STATUS_TONE[v.status] ?? 'neutral'}>{v.status.replace(/_/g, ' ')}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </Card>
  );
}

function RequestsTab() {
  const qc = useQueryClient();
  const [declining, setDeclining] = useState<ViewingRequest | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['viewing-requests'],
    queryFn: () => api.get<Page<ViewingRequest>>('/viewing-requests', { pageSize: 50 }),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/viewing-requests/${id}/confirm`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viewing-requests'] });
      qc.invalidateQueries({ queryKey: ['viewings'] });
    },
  });
  const decline = useMutation({
    mutationFn: ({ id, responseNote }: { id: string; responseNote: string }) => api.post(`/viewing-requests/${id}/decline`, { responseNote: responseNote || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viewing-requests'] });
      setDeclining(null);
    },
  });

  if (isLoading) return <Spinner />;
  if (!data || data.items.length === 0) {
    return <Card><EmptyState icon={<CalendarClock size={28} />} title="No viewing requests yet" body="When a client requests a viewing from their shortlist link, it'll show up here." /></Card>;
  }

  return (
    <>
      <Card>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Property</th>
              <th className="px-5 py-3 font-medium">Preferred time</th>
              <th className="px-5 py-3 font-medium">Notes</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-sunk">
                <td className="px-5 py-3 font-medium text-ink">{r.clientName}</td>
                <td className="px-5 py-3 text-muted">{r.propertyTitle}</td>
                <td className="px-5 py-3 text-muted">{new Date(r.preferredAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="px-5 py-3 max-w-xs truncate text-muted">{r.notes ?? '—'}</td>
                <td className="px-5 py-3"><Badge tone={REQUEST_TONE[r.status]}>{r.status}</Badge></td>
                <td className="px-5 py-3 text-right">
                  {r.status === 'PENDING' && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => confirm.mutate(r.id)} title="Confirm & schedule"><Check size={14} /></Button>
                      <Button variant="ghost" onClick={() => setDeclining(r)} title="Decline"><X size={14} /></Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
      <DeclineModal request={declining} onClose={() => setDeclining(null)} onConfirm={(note) => declining && decline.mutate({ id: declining.id, responseNote: note })} pending={decline.isPending} error={decline.error} />
    </>
  );
}

function DeclineModal({
  request, onClose, onConfirm, pending, error,
}: { request: ViewingRequest | null; onClose: () => void; onConfirm: (note: string) => void; pending: boolean; error: unknown }) {
  const [note, setNote] = useState('');
  if (!request) return null;
  return (
    <Modal open onClose={onClose} title={`Decline request from ${request.clientName}`}>
      <form onSubmit={(e) => { e.preventDefault(); onConfirm(note); }}>
        <label className="mb-1 block text-sm font-medium text-ink">Reason (optional, shown to your team only)</label>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          className="mb-3 w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-ink focus:border-cypress-500 focus:outline-none focus:ring-2 focus:ring-cypress-100"
          placeholder="e.g. Fully booked that day"
        />
        {!!error && <p className="mb-3 text-sm text-danger">{error instanceof ApiError ? error.message : 'Something went wrong'}</p>}
        <Button type="submit" variant="danger" disabled={pending} className="w-full">{pending ? 'Declining…' : 'Decline request'}</Button>
      </form>
    </Modal>
  );
}
