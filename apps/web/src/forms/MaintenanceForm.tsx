import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES,
  type MaintenanceItem, type Page, type PropertyListItem,
} from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { VoiceButton } from '../components/VoiceButton';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { PhoneInput } from '../components/ui/PhoneInput';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { currencyCode } from '../lib/currency';

const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ');
const num = (v: string) => (v.trim() === '' ? null : Math.round(Number(v)));

export function MaintenanceForm({ item, onDone, propertyId: presetProperty }: { item?: MaintenanceItem; onDone: () => void; propertyId?: string }) {
  const qc = useQueryClient();
  const editing = !!item;
  const [propertyId, setPropertyId] = useState(item?.propertyId ?? presetProperty ?? '');
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category ?? 'OTHER');
  const [priority, setPriority] = useState(item?.priority ?? 'MEDIUM');
  const [status, setStatus] = useState(item?.status ?? 'OPEN');
  const [vendorName, setVendorName] = useState(item?.vendorName ?? '');
  const [vendorPhone, setVendorPhone] = useState(item?.vendorPhone ?? '');
  const [estimated, setEstimated] = useState(item?.estimatedCost?.toString() ?? '');
  const [actual, setActual] = useState(item?.actualCost?.toString() ?? '');
  const [charge, setCharge] = useState(item?.chargeToLandlord ?? false);
  const [error, setError] = useState<string | null>(null);

  const { data: properties } = useQuery({
    queryKey: ['properties-picker'],
    queryFn: () => api.get<Page<PropertyListItem>>('/properties', { pageSize: 100 }),
    enabled: !editing && !presetProperty,
  });

  const save = useMutation({
    mutationFn: () => {
      const common = { title, description: description || null, category, priority, vendorName: vendorName || null, vendorPhone: vendorPhone || null, estimatedCost: num(estimated) };
      return editing
        ? api.patch(`/maintenance/${item!.id}`, { ...common, status, actualCost: num(actual), chargeToLandlord: charge })
        : api.post('/maintenance', { ...common, propertyId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['rent'] }); qc.invalidateQueries({ queryKey: ['unit'] }); qc.invalidateQueries({ queryKey: ['buildings'] }); onDone(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
      {editing ? (
        <p className="mb-4 text-sm text-muted">{item!.propertyTitle}{item!.tenantName ? ` · reported by ${item!.tenantName}` : ''}</p>
      ) : presetProperty ? null : (
        <Field label="Property">
          <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
            <option value="">Select…</option>
            {properties?.items.map((p) => <option key={p.id} value={p.id}>{p.title} — {p.location}</option>)}
          </Select>
        </Field>
      )}
      <Field label="What needs fixing?">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Burst pipe in main bathroom" required minLength={2} maxLength={140} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {MAINTENANCE_CATEGORIES.map((c) => <option key={c} value={c}>{nice(c)}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            {MAINTENANCE_PRIORITIES.map((c) => <option key={c} value={c}>{nice(c)}</option>)}
          </Select>
        </Field>
        <Field label="Vendor / fundi"><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} /></Field>
        <Field label="Vendor phone"><PhoneInput value={vendorPhone} onChange={setVendorPhone} /></Field>
        <Field label={`Estimated cost (${currencyCode()})`}><Input type="number" min={0} value={estimated} onChange={(e) => setEstimated(e.target.value)} /></Field>
        {editing && (
          <Field label={`Final cost (${currencyCode()})`}><Input type="number" min={0} value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
        )}
      </div>
      {editing && (
        <>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {MAINTENANCE_STATUSES.map((c) => <option key={c} value={c}>{nice(c)}</option>)}
            </Select>
          </Field>
          <label className="mb-4 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-0.5" checked={charge} onChange={(e) => setCharge(e.target.checked)} />
            <span>Charge the final cost to the landlord. It is deducted from their statement for the month the repair is marked done.</span>
          </label>
        </>
      )}
      <Field label="Details (optional)">
        <textarea
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-cypress-600 focus:outline-none"
          rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
        />
        <VoiceButton onText={(x) => setDescription((d) => (d ? `${d} ${x}` : x).slice(0, 2000))} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Log repair'}</Button>
    </form>
  );
}
