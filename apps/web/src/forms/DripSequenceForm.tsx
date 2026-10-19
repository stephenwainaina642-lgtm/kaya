import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { LEAD_SOURCES, CONTACT_METHODS, FOLLOW_UP_PRIORITIES } from '@kaya/shared';
import type { DripSequence, DripStepInput } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

function emptyStep(): DripStepInput {
  return { offsetHours: 0, title: '', channel: null, priority: 'MEDIUM' };
}

export function DripSequenceForm({ sequence, onDone }: { sequence?: DripSequence; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(sequence?.name ?? '');
  const [description, setDescription] = useState(sequence?.description ?? '');
  const [active, setActive] = useState(sequence?.active ?? true);
  const [sourceFilter, setSourceFilter] = useState<string>(sequence?.sourceFilter ?? '');
  const [steps, setSteps] = useState<DripStepInput[]>(
    sequence?.steps.map((s) => ({ offsetHours: s.offsetHours, title: s.title, notes: s.notes, channel: s.channel, priority: s.priority })) ?? [emptyStep()],
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || null, active, sourceFilter: sourceFilter || null, steps };
      return sequence ? api.patch(`/automation/sequences/${sequence.id}`, body) : api.post('/automation/sequences', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-sequences'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function updateStep(i: number, patch: Partial<DripStepInput>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Field label="Sequence name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New lead welcome" required />
      </Field>
      <Field label="Description (optional)">
        <TextArea rows={2} value={description ?? ''} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Enroll leads from">
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">Any source</option>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
      </div>

      <div className="mb-2 mt-4 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">Steps</h3>
        <Button type="button" variant="secondary" onClick={() => setSteps((prev) => [...prev, emptyStep()])}>
          <Plus size={14} /> Add step
        </Button>
      </div>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="rounded-control border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-faint">Step {i + 1}</span>
              {steps.length > 1 && (
                <button type="button" onClick={() => removeStep(i)} className="text-faint hover:text-danger">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Title">
                <Input value={step.title} onChange={(e) => updateStep(i, { title: e.target.value })} placeholder="e.g. Send welcome message" required />
              </Field>
              <Field label="Send after (hours from enrollment)">
                <Input
                  type="number" min={0} value={step.offsetHours}
                  onChange={(e) => updateStep(i, { offsetHours: Number(e.target.value) })}
                  required
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Channel (optional)">
                <Select value={step.channel ?? ''} onChange={(e) => updateStep(i, { channel: (e.target.value || null) as DripStepInput['channel'] })}>
                  <option value="">Unspecified</option>
                  {CONTACT_METHODS.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={step.priority} onChange={(e) => updateStep(i, { priority: e.target.value as typeof step.priority })}>
                  {FOLLOW_UP_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Notes (optional)">
              <TextArea rows={2} value={step.notes ?? ''} onChange={(e) => updateStep(i, { notes: e.target.value || null })} />
            </Field>
          </div>
        ))}
      </div>

      {error && <p className="mb-3 mt-3 text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : sequence ? 'Save changes' : 'Create sequence'}</Button>
      </div>
    </form>
  );
}
