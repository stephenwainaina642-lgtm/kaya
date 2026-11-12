import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientListItem, PropertyListItem, Page } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { currencyCode } from '../lib/currency';

export function NewLeaseForm({ onDone, propertyId: fixedProperty, suggestedRent }: { onDone: () => void; propertyId?: string; suggestedRent?: number }) {
  const qc = useQueryClient();
  const [propertyId, setPropertyId] = useState(fixedProperty ?? '');
  const [tenantId, setTenantId] = useState('');
  const [rentAmount, setRentAmount] = useState(suggestedRent ? String(suggestedRent) : '');
  const [depositAmount, setDepositAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [feePct, setFeePct] = useState('10');
  const [withholdingPct, setWithholdingPct] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const { data: properties } = useQuery({
    queryKey: ['properties-picker'],
    queryFn: () => api.get<Page<PropertyListItem>>('/properties', { pageSize: 100 }),
  });
  const { data: clients } = useQuery({
    queryKey: ['clients-picker'],
    queryFn: () => api.get<Page<ClientListItem>>('/clients', { pageSize: 100 }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/rent/leases', {
        propertyId, tenantId,
        rentAmount: Math.round(Number(rentAmount)),
        depositAmount: Math.round(Number(depositAmount || 0)),
        dueDay: Number(dueDay),
        startDate,
        endDate: endDate || null,
        feeBps: Math.round(Number(feePct || 0) * 100),
        withholdingBps: Math.round(Number(withholdingPct || 0) * 100),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent'] });
      qc.invalidateQueries({ queryKey: ['unit'] });
      qc.invalidateQueries({ queryKey: ['buildings'] });
      qc.invalidateQueries({ queryKey: ['property'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
      <Field label="Property">
        <Select value={propertyId} disabled={!!fixedProperty} onChange={(e) => setPropertyId(e.target.value)} required>
          <option value="">Select…</option>
          {properties?.items.map((p) => <option key={p.id} value={p.id}>{p.title} — {p.location}</option>)}
        </Select>
      </Field>
      <Field label="Tenant (a client)">
        <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
          <option value="">Select…</option>
          {clients?.items.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Monthly rent (${currencyCode()})`}>
          <Input type="number" min={1} value={rentAmount} onChange={(e) => setRentAmount(e.target.value)} required />
        </Field>
        <Field label={`Deposit held (${currencyCode()})`}>
          <Input type="number" min={0} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
        </Field>
        <Field label="Rent due on day of month (1–28)">
          <Input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} required />
        </Field>
        <Field label="Lease start">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="Lease end (optional)">
          <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field label="Your management fee (%)">
          <Input type="number" min={0} max={50} step="0.1" value={feePct} onChange={(e) => setFeePct(e.target.value)} />
        </Field>
        <Field label="Tax withheld from landlord (%)">
          <Input type="number" min={0} max={50} step="0.1" value={withholdingPct} onChange={(e) => setWithholdingPct(e.target.value)} />
        </Field>
      </div>
      <p className="mb-3 text-xs text-muted">
        Kaya does not assume a tax rate. Confirm the right withholding with your accountant or KRA before relying on statements.
      </p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create lease'}</Button>
    </form>
  );
}
