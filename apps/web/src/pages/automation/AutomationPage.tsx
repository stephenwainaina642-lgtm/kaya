import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Shuffle, UserCheck, X } from 'lucide-react';
import type { AutomationRule, DripSequence, DripEnrollment, Page } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { AutomationRuleForm } from '../../forms/AutomationRuleForm';
import { DripSequenceForm } from '../../forms/DripSequenceForm';

type Tab = 'rules' | 'sequences' | 'enrollments';

const ENROLLMENT_TONE = { ACTIVE: 'ok', COMPLETED: 'neutral', CANCELLED: 'danger' } as const;

export function AutomationPage() {
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <>
      <PageHeader title="Automation" subtitle="Auto-assign new leads and run drip follow-up sequences" />
      <div className="p-8">
        <div className="mb-6 flex gap-1 border-b border-line">
          {([['rules', 'Auto-assignment rules'], ['sequences', 'Drip sequences'], ['enrollments', 'Enrollments']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === key ? 'border-cypress-600 text-cypress-700' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'rules' && <RulesTab />}
        {tab === 'sequences' && <SequencesTab />}
        {tab === 'enrollments' && <EnrollmentsTab />}
      </div>
    </>
  );
}

function RulesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AutomationRule | 'new' | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['automation-rules'], queryFn: () => api.get<AutomationRule[]>('/automation/rules') });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/automation/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}><Plus size={14} /> New rule</Button>
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New auto-assignment rule' : 'Edit rule'}>
        {editing !== null && <AutomationRuleForm rule={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>

      {isLoading || !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Card><EmptyState icon={<UserCheck size={28} />} title="No auto-assignment rules yet" body="Create a rule to route new leads to the right agent automatically, by source." /></Card>
      ) : (
        <div className="space-y-3">
          {data.map((rule) => (
            <Card key={rule.id} className="flex items-center gap-4 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-cypress-50 text-cypress-700">
                {rule.strategy === 'ROUND_ROBIN' ? <Shuffle size={16} /> : <UserCheck size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-ink">{rule.name}</p>
                  <Badge tone={rule.active ? 'ok' : 'neutral'}>{rule.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="truncate text-xs text-muted">
                  {rule.sourceFilter ? rule.sourceFilter.replace(/_/g, ' ') : 'Any source'} →{' '}
                  {rule.strategy === 'SPECIFIC_AGENT' ? (rule.specificAgent?.name ?? 'No agent set') : `Round-robin (${rule.agentPool.length} agents)`}
                  {' '}· priority {rule.priority}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setEditing(rule)}><Pencil size={14} /></Button>
              <Button variant="ghost" onClick={() => { if (confirm(`Delete "${rule.name}"?`)) del.mutate(rule.id); }}><Trash2 size={14} /></Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function SequencesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<DripSequence | 'new' | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['automation-sequences'], queryFn: () => api.get<DripSequence[]>('/automation/sequences') });

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/automation/sequences/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-sequences'] }),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}><Plus size={14} /> New sequence</Button>
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New drip sequence' : 'Edit sequence'} width="max-w-2xl">
        {editing !== null && <DripSequenceForm sequence={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>

      {isLoading || !data ? (
        <Spinner />
      ) : data.length === 0 ? (
        <Card><EmptyState title="No drip sequences yet" body="Create a sequence to automatically follow up with new leads over time." /></Card>
      ) : (
        <div className="space-y-3">
          {data.map((seq) => (
            <Card key={seq.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-ink">{seq.name}</p>
                    <Badge tone={seq.active ? 'ok' : 'neutral'}>{seq.active ? 'Active' : 'Inactive'}</Badge>
                    {seq.activeEnrollments > 0 && <Badge tone="accent">{seq.activeEnrollments} enrolled</Badge>}
                  </div>
                  {seq.description && <p className="mt-0.5 text-sm text-muted">{seq.description}</p>}
                  <p className="mt-1 text-xs text-faint">{seq.sourceFilter ? `From ${seq.sourceFilter.replace(/_/g, ' ')} leads` : 'From any lead source'}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => setEditing(seq)}><Pencil size={14} /></Button>
                  <Button variant="ghost" onClick={() => { if (confirm(`Delete "${seq.name}"?`)) del.mutate(seq.id); }}><Trash2 size={14} /></Button>
                </div>
              </div>
              <ol className="mt-3 space-y-1 border-t border-line pt-3">
                {seq.steps.map((step) => (
                  <li key={step.id} className="flex items-center gap-2 text-sm">
                    <span className="w-20 shrink-0 text-xs text-faint">{step.offsetHours === 0 ? 'Immediately' : `+${step.offsetHours}h`}</span>
                    <span className="text-ink">{step.title}</span>
                    {step.channel && <span className="text-xs text-faint">({step.channel})</span>}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function EnrollmentsTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['automation-enrollments'],
    queryFn: () => api.get<Page<DripEnrollment>>('/automation/enrollments', { pageSize: 50 }),
    retry: false,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/automation/enrollments/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-enrollments'] }),
  });

  if (isError) {
    return <Card><EmptyState title="Couldn't load enrollments" body={error instanceof ApiError ? error.message : undefined} /></Card>;
  }
  if (isLoading || !data) return <Spinner />;
  if (data.items.length === 0) {
    return <Card><EmptyState title="No one enrolled yet" body="Enrollments appear here automatically when a new lead matches an active drip sequence." /></Card>;
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
            <th className="px-4 py-3 font-medium">Contact</th>
            <th className="px-4 py-3 font-medium">Sequence</th>
            <th className="px-4 py-3 font-medium">Progress</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Enrolled</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {data.items.map((e) => (
            <tr key={e.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 text-ink">{e.contactName}</td>
              <td className="px-4 py-3 text-muted">{e.sequenceName}</td>
              <td className="px-4 py-3 text-muted">{e.stepsDone} / {e.stepsTotal} steps</td>
              <td className="px-4 py-3"><Badge tone={ENROLLMENT_TONE[e.status]}>{e.status}</Badge></td>
              <td className="px-4 py-3 text-muted">{new Date(e.enrolledAt).toLocaleDateString('en-KE')}</td>
              <td className="px-4 py-3 text-right">
                {e.status === 'ACTIVE' && (
                  <Button variant="ghost" onClick={() => cancel.mutate(e.id)} title="Cancel enrollment">
                    <X size={14} />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
