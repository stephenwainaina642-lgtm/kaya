import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, RefreshCw, Download } from 'lucide-react';
import type {
  ArrearsReport, GenerateRentResult, LeaseItem, OwnerStatement, RentChargeItem, RentOverview, OwnerListItem, Page,
} from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NewLeaseForm } from '../../forms/NewLeaseForm';
import { RecordRentPaymentForm } from '../../forms/RecordRentPaymentForm';

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const TONE = { UNPAID: 'danger', PARTIAL: 'warn', PAID: 'ok' } as const;
type Tab = 'roll' | 'leases' | 'arrears' | 'statements';
const TABS: [Tab, string][] = [['roll', 'Rent roll'], ['leases', 'Leases'], ['arrears', 'Arrears'], ['statements', 'Landlord statements']];

export function RentPage() {
  const [tab, setTab] = useState<Tab>('roll');
  const [showLease, setShowLease] = useState(false);
  return (
    <>
      <PageHeader
        title="Rent"
        subtitle="Leases, monthly rent, arrears and landlord statements"
        actions={<Button onClick={() => setShowLease(true)}><Plus size={16} /> New lease</Button>}
      />
      <Modal open={showLease} onClose={() => setShowLease(false)} title="New lease">
        <NewLeaseForm onDone={() => setShowLease(false)} />
      </Modal>
      <div className="px-8 pt-6">
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === key ? 'border-cypress-600 text-cypress-700' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-8 pb-8">
        {tab === 'roll' && <RentRoll />}
        {tab === 'leases' && <Leases />}
        {tab === 'arrears' && <Arrears />}
        {tab === 'statements' && <Statements />}
      </div>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

function RentRoll() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(thisMonth());
  const [paying, setPaying] = useState<RentChargeItem | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ['rent', 'overview', period], queryFn: () => api.get<RentOverview>('/rent/overview', { period }) });
  const charges = useQuery({ queryKey: ['rent', 'charges', period], queryFn: () => api.get<RentChargeItem[]>('/rent/charges', { period }) });
  const generate = useMutation({
    mutationFn: () => api.post<GenerateRentResult>('/rent/charges/generate', { period }),
    onSuccess: (r) => {
      setNote(r.created ? `Raised rent for ${r.created} lease${r.created === 1 ? '' : 's'}.` : 'Rent for this month was already raised.');
      qc.invalidateQueries({ queryKey: ['rent'] });
    },
    onError: (e) => setNote(e instanceof ApiError ? e.message : 'Something went wrong'),
  });
  const o = overview.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Input type="month" value={period} onChange={(e) => { setPeriod(e.target.value); setNote(null); }} /></div>
        <Button variant="secondary" onClick={() => generate.mutate()} disabled={generate.isPending}>
          <RefreshCw size={15} /> {generate.isPending ? 'Raising…' : 'Raise rent for this month'}
        </Button>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
      <p className="-mt-2 text-xs text-muted">
        Rent is raised automatically each month for every active lease. Use the button to raise a past or future month.
      </p>
      {o && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Expected" value={kes(o.expected)} sub={`${o.activeLeases} active lease${o.activeLeases === 1 ? '' : 's'}`} />
          <Stat label="Collected" value={kes(o.collected)} />
          <Stat label="Outstanding" value={kes(o.outstanding)} />
          <Stat label="Collection rate" value={`${Math.round(o.collectionRate * 100)}%`} />
        </div>
      )}
      {charges.isLoading ? <Spinner /> : !charges.data?.length ? (
        <EmptyState icon={<KeyRound size={22} />} title="No rent raised for this month" body="Create a lease, then raise this month's rent to start tracking payments." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Property</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Due</th>
              <th className="px-4 py-3 text-right">Rent</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody>
              {charges.data.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{c.propertyTitle}</td>
                  <td className="px-4 py-3">{c.tenantName}</td>
                  <td className="px-4 py-3">{c.dueDate}</td>
                  <td className="px-4 py-3 text-right">{kes(c.amount)}</td>
                  <td className="px-4 py-3 text-right">{kes(c.paidAmount)}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[c.status]}>{c.status[0] + c.status.slice(1).toLowerCase()}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {c.status !== 'PAID' && <Button variant="secondary" onClick={() => setPaying(c)}>Record payment</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Record rent payment">
        {paying && <RecordRentPaymentForm charge={paying} onDone={() => setPaying(null)} />}
      </Modal>
    </div>
  );
}

function Leases() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['rent', 'leases'], queryFn: () => api.get<LeaseItem[]>('/rent/leases') });
  const end = useMutation({
    mutationFn: (id: string) => api.post(`/rent/leases/${id}/end`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rent'] }),
  });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <EmptyState icon={<KeyRound size={22} />} title="No leases yet" body="Add a lease to start raising monthly rent." />;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th className="px-4 py-3">Property</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Landlord</th>
          <th className="px-4 py-3 text-right">Rent</th><th className="px-4 py-3">Since</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
        </tr></thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-medium text-ink">{l.propertyTitle}</td>
              <td className="px-4 py-3">{l.tenantName}</td>
              <td className="px-4 py-3">{l.ownerName ?? '—'}</td>
              <td className="px-4 py-3 text-right">{kes(l.rentAmount)}</td>
              <td className="px-4 py-3">{l.startDate}</td>
              <td className="px-4 py-3"><Badge tone={l.status === 'ACTIVE' ? 'ok' : 'neutral'}>{l.status === 'ACTIVE' ? 'Active' : 'Ended'}</Badge></td>
              <td className="px-4 py-3 text-right">
                {l.status === 'ACTIVE' && (
                  <Button variant="ghost" disabled={end.isPending} onClick={() => { if (window.confirm('End this lease? No more rent will be raised for it.')) end.mutate(l.id); }}>End lease</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Arrears() {
  const { data, isLoading } = useQuery({ queryKey: ['rent', 'arrears'], queryFn: () => api.get<ArrearsReport>('/rent/arrears') });
  if (isLoading) return <Spinner />;
  if (!data?.rows.length) return <EmptyState icon={<KeyRound size={22} />} title="No overdue rent" body="Nothing is past its due date and unpaid." />;
  return (
    <div className="space-y-4">
      <Stat label="Total overdue" value={kes(data.total)} sub={`${data.rows.length} charge${data.rows.length === 1 ? '' : 's'}`} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Property</th><th className="px-4 py-3">Month</th>
            <th className="px-4 py-3 text-right">Owed</th><th className="px-4 py-3 text-right">Days late</th><th className="px-4 py-3">Phone</th>
          </tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.chargeId} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{r.tenantName}</td>
                <td className="px-4 py-3">{r.propertyTitle}</td>
                <td className="px-4 py-3">{r.period}</td>
                <td className="px-4 py-3 text-right">{kes(r.balance)}</td>
                <td className="px-4 py-3 text-right"><Badge tone={r.daysOverdue > 30 ? 'danger' : 'warn'}>{r.daysOverdue}</Badge></td>
                <td className="px-4 py-3">{r.tenantPhone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Statements() {
  const [ownerId, setOwnerId] = useState('');
  const [period, setPeriod] = useState(thisMonth());
  const owners = useQuery({ queryKey: ['owners-picker'], queryFn: () => api.get<Page<OwnerListItem>>('/owners', { pageSize: 100 }) });
  const st = useQuery({
    queryKey: ['rent', 'statement', ownerId, period],
    queryFn: () => api.get<OwnerStatement>(`/rent/statements/${ownerId}`, { period }),
    enabled: !!ownerId,
  });
  const s = st.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Choose a landlord…</option>
            {owners.data?.items.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
          </Select>
        </div>
        <div className="w-44"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
        {s && s.lines.length > 0 && (
          <Button variant="secondary" onClick={() => api.download(`/rent/statements/${ownerId}?period=${period}&format=csv`, 'statement.csv')}>
            <Download size={15} /> Download CSV
          </Button>
        )}
      </div>
      {!ownerId ? (
        <EmptyState icon={<KeyRound size={22} />} title="Pick a landlord" body="See what was collected for their properties, less your fee and any tax withheld." />
      ) : st.isLoading ? <Spinner /> : !s?.lines.length ? (
        <EmptyState icon={<KeyRound size={22} />} title="Nothing for this month" body="No rent was raised for this landlord's properties in that month." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Property</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3 text-right">Rent due</th>
              <th className="px-4 py-3 text-right">Collected</th><th className="px-4 py-3 text-right">Your fee</th>
              <th className="px-4 py-3 text-right">Tax withheld</th><th className="px-4 py-3 text-right">Pay landlord</th>
            </tr></thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.leaseId} className="border-b border-line">
                  <td className="px-4 py-3 font-medium text-ink">{l.propertyTitle}</td><td className="px-4 py-3">{l.tenantName}</td>
                  <td className="px-4 py-3 text-right">{kes(l.rentDue)}</td><td className="px-4 py-3 text-right">{kes(l.collected)}</td>
                  <td className="px-4 py-3 text-right">{kes(l.managementFee)}</td><td className="px-4 py-3 text-right">{kes(l.withholding)}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{kes(l.netToLandlord)}</td>
                </tr>
              ))}
              <tr className="bg-ground font-medium text-ink">
                <td className="px-4 py-3" colSpan={2}>Total</td>
                <td className="px-4 py-3 text-right">{kes(s.totals.rentDue)}</td><td className="px-4 py-3 text-right">{kes(s.totals.collected)}</td>
                <td className="px-4 py-3 text-right">{kes(s.totals.managementFee)}</td><td className="px-4 py-3 text-right">{kes(s.totals.withholding)}</td>
                <td className="px-4 py-3 text-right">{kes(s.totals.netToLandlord)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
