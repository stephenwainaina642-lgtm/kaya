import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LEAD_SOURCES, ASSIGN_STRATEGIES } from '@kaya/shared';
import type { AutomationRule, TeamMember } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';

export function AutomationRuleForm({ rule, onDone }: { rule?: AutomationRule; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: team } = useQuery({ queryKey: ['team'], queryFn: () => api.get<{ items: TeamMember[] }>('/team/members') });

  const [name, setName] = useState(rule?.name ?? '');
  const [active, setActive] = useState(rule?.active ?? true);
  const [priority, setPriority] = useState(rule?.priority ?? 100);
  const [sourceFilter, setSourceFilter] = useState<string>(rule?.sourceFilter ?? '');
  const [strategy, setStrategy] = useState<string>(rule?.strategy ?? 'SPECIFIC_AGENT');
  const [specificAgentId, setSpecificAgentId] = useState(rule?.specificAgent?.id ?? '');
  const [agentPoolIds, setAgentPoolIds] = useState<string[]>(rule?.agentPool.map((a) => a.id) ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        active,
        priority,
        sourceFilter: sourceFilter || null,
        strategy,
        specificAgentId: strategy === 'SPECIFIC_AGENT' ? specificAgentId : undefined,
        agentPoolIds: strategy === 'ROUND_ROBIN' ? agentPoolIds : undefined,
      };
      return rule ? api.patch(`/automation/rules/${rule.id}`, body) : api.post('/automation/rules', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-rules'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function toggleAgent(id: string) {
    setAgentPoolIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Field label="Rule name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website leads to Juma" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Priority (lower runs first)">
          <Input type="number" min={1} max={1000} value={priority} onChange={(e) => setPriority(Number(e.target.value))} required />
        </Field>
      </div>
      <Field label="Only applies to leads from">
        <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="">Any source</option>
          {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Assign to">
        <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
          {ASSIGN_STRATEGIES.map((s) => (
            <option key={s} value={s}>{s === 'SPECIFIC_AGENT' ? 'A specific agent' : 'Round-robin across a pool of agents'}</option>
          ))}
        </Select>
      </Field>

      {strategy === 'SPECIFIC_AGENT' && (
        <Field label="Agent">
          <Select value={specificAgentId} onChange={(e) => setSpecificAgentId(e.target.value)} required>
            <option value="" disabled>Choose an agent</option>
            {team?.items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
      )}

      {strategy === 'ROUND_ROBIN' && (
        <Field label="Agent pool">
          <div className="space-y-1.5 rounded-control border border-line p-3">
            {team?.items.length === 0 && <p className="text-sm text-muted">No other team members yet.</p>}
            {team?.items.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={agentPoolIds.includes(m.id)} onChange={() => toggleAgent(m.id)} />
                {m.name}
              </label>
            ))}
          </div>
        </Field>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}</Button>
      </div>
    </form>
  );
}
