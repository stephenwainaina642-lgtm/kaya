import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, RefreshCw, Download, MessageCircle, Printer, Mail, Upload } from 'lucide-react';
import { periodLabel, rentReminderMessage, whatsappLink } from '@kaya/shared';
import type {
  TenantStatement, VacancyReport,
  ArrearsReport, RentPaymentItem, GenerateRentResult, LeaseItem, OwnerStatement, RentChargeItem, RentOverview, OwnerListItem, Page,
} from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { printRentReceipt, receiptNumber } from '../../lib/rentReceipt';
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
import { printTenantStatement } from '../../lib/tenantStatement';
import { MatchMpesaForm } from '../../forms/MatchMpesaForm';
import { ImportLeasesForm } from '../../forms/ImportLeasesForm';
import { LeaseLetterForm } from '../../forms/LeaseLetterForm';
import { AddChargeForm } from '../../forms/AddChargeForm';
import { SettleDepositForm } from '../../forms/SettleDepositForm';
import { RenewLeaseForm } from '../../forms/RenewLeaseForm';
import { RecordRentPaymentForm } from '../../forms/RecordRentPaymentForm';

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const TONE = { UNPAID: 'danger', PARTIAL: 'warn', PAID: 'ok' } as const;
type Tab = 'roll' | 'leases' | 'arrears' | 'vacancies' | 'statements';
const TABS: [Tab, string][] = [['roll', 'Rent roll'], ['leases', 'Leases'], ['arrears', 'Arrears'], ['vacancies', 'Vacancies'], ['statements', 'Landlord statements']];

export function RentPage() {
  const [tab, setTab] = useState<Tab>('roll');
  const [showLease, setShowLease] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  return (
    <>
      <PageHeader
        title="Rent"
        subtitle="Leases, monthly rent, arrears and landlord statements"
        actions={(
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowMatch(true)}>Match M-Pesa</Button>
            <Button variant="secondary" onClick={() => setShowImport(true)}><Upload size={16} /> Import</Button>
            <Button onClick={() => setShowLease(true)}><Plus size={16} /> New lease</Button>
          </div>
        )}
      />
      <Modal open={showMatch} onClose={() => setShowMatch(false)} title="Match M-Pesa payments" width="max-w-2xl">
        <MatchMpesaForm onDone={() => setShowMatch(false)} />
      </Modal>
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import leases from CSV">
        <ImportLeasesForm onDone={() => setShowImport(false)} />
      </Modal>
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
        {tab === 'vacancies' && <Vacancies />}
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
  const [receiptsFor, setReceiptsFor] = useState<RentChargeItem | null>(null);
  const [extrasFor, setExtrasFor] = useState<RentChargeItem | null>(null);
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
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {kes(c.amount)}
                    {c.extras.length > 0 && <p className="text-xs text-muted">incl. {c.extras.map((x) => x.label).join(', ')}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{kes(c.paidAmount)}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[c.status]}>{c.status[0] + c.status.slice(1).toLowerCase()}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      <Button variant="ghost" onClick={() => setExtrasFor(c)}>+ Charge</Button>
                      {c.paidAmount > 0 && <Button variant="ghost" onClick={() => setReceiptsFor(c)}>Receipts</Button>}
                      {c.status !== 'PAID' && <Button variant="secondary" onClick={() => setPaying(c)}>Record payment</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!extrasFor} onClose={() => setExtrasFor(null)} title="Extra charges this month">
        {extrasFor && <AddChargeForm charge={extrasFor} onDone={() => setExtrasFor(null)} />}
      </Modal>
      <Modal open={!!receiptsFor} onClose={() => setReceiptsFor(null)} title="Payments & receipts">
        {receiptsFor && <Receipts charge={receiptsFor} />}
      </Modal>
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Record rent payment">
        {paying && <RecordRentPaymentForm charge={paying} onDone={() => setPaying(null)} />}
      </Modal>
    </div>
  );
}

function Receipts({ charge }: { charge: RentChargeItem }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['rent', 'payments', charge.id],
    queryFn: () => api.get<RentPaymentItem[]>(`/rent/charges/${charge.id}/payments`),
  });
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const email = useMutation({
    mutationFn: (id: string) => api.post<{ sent: boolean; to: string }>(`/rent/payments/${id}/email-receipt`),
    onSuccess: (r, id) => setMsg({ id, ok: true, text: `Sent to ${r.to}` }),
    onError: (err, id) => setMsg({ id, ok: false, text: err instanceof ApiError ? err.message : 'Could not send' }),
  });
  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-2">
      <p className="mb-3 text-sm text-muted">{charge.tenantName} · {charge.propertyTitle} · {charge.period}</p>
      {data?.map((p) => (
        <div key={p.id}>
        <div className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-sm">
          <div>
            <p className="font-medium text-ink">{kes(p.amount)} <span className="font-normal text-muted">· {p.method === 'MPESA' ? 'M-Pesa' : p.method[0] + p.method.slice(1).toLowerCase()}{p.reference ? ` ${p.reference}` : ''}</span></p>
            <p className="text-xs text-muted">{new Date(p.paidAt).toLocaleDateString('en-KE')} · {receiptNumber(p.id)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={email.isPending} onClick={() => { setMsg(null); email.mutate(p.id); }}>
              <Mail size={15} /> {email.isPending && email.variables === p.id ? 'Sending…' : 'Email'}
            </Button>
            <Button variant="secondary" onClick={() => printRentReceipt(user?.organizationName ?? 'Receipt', charge, p)}>
              <Printer size={15} /> Print
            </Button>
          </div>
        </div>
        {msg?.id === p.id && <p className={`px-1 pt-1 text-xs ${msg.ok ? 'text-cypress-700' : 'text-danger'}`}>{msg.text}</p>}
        </div>
      ))}
    </div>
  );
}

function endsIn(l: LeaseItem): { label: string; tone: 'danger' | 'warn' | 'neutral' } | null {
  if (!l.endDate || l.status !== 'ACTIVE') return null;
  const days = Math.round((Date.parse(l.endDate) - Date.parse(new Date().toISOString().slice(0, 10))) / 86_400_000);
  if (days < 0) return { label: `Ended ${-days}d ago`, tone: 'danger' };
  if (days <= 60) return { label: `${days}d left`, tone: days <= 14 ? 'danger' : 'warn' };
  return null;
}

function Leases() {
  const qc = useQueryClient();
  const [renewing, setRenewing] = useState<LeaseItem | null>(null);
  const [settling, setSettling] = useState<LeaseItem | null>(null);
  const [lettering, setLettering] = useState<LeaseItem | null>(null);
  const { user } = useAuth();
  const openStatement = async (id: string) => {
    const st = await api.get<TenantStatement>(`/rent/leases/${id}/statement`);
    printTenantStatement(user?.organizationName ?? 'Statement', st);
  };
  const { data, isLoading } = useQuery({ queryKey: ['rent', 'leases'], queryFn: () => api.get<LeaseItem[]>('/rent/leases') });
  const end = useMutation({
    mutationFn: (id: string) => api.post(`/rent/leases/${id}/end`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rent'] }),
  });
  if (isLoading) return <Spinner />;
  if (!data?.length) return <EmptyState icon={<KeyRound size={22} />} title="No leases yet" body="Add a lease to start raising monthly rent." />;
  return (
    <>
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th className="px-4 py-3">Property</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Landlord</th>
          <th className="px-4 py-3 text-right">Rent</th><th className="px-4 py-3">Since</th><th className="px-4 py-3">Ends</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
        </tr></thead>
        <tbody>
          {data.map((l) => {
            const soon = endsIn(l);
            return (
            <tr key={l.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 font-medium text-ink">{l.propertyTitle}</td>
              <td className="px-4 py-3">{l.tenantName}</td>
              <td className="px-4 py-3">{l.ownerName ?? '—'}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">{kes(l.rentAmount)}</td>
              <td className="whitespace-nowrap px-4 py-3">{l.startDate}</td>
              <td className="whitespace-nowrap px-4 py-3">
                {l.endDate ?? '—'} {soon && <Badge tone={soon.tone}>{soon.label}</Badge>}
              </td>
              <td className="px-4 py-3"><Badge tone={l.status === 'ACTIVE' ? 'ok' : 'neutral'}>{l.status === 'ACTIVE' ? 'Active' : 'Ended'}</Badge></td>
              <td className="px-4 py-3 text-right">
                <div className="flex max-w-[15rem] flex-wrap items-center justify-end gap-1">
                {l.status === 'ACTIVE' && (
                  <>
                    <Button variant="ghost" onClick={() => setLettering(l)}>Letter</Button>
                    <Button variant="secondary" onClick={() => setRenewing(l)}>Renew</Button>
                    <Button variant="ghost" disabled={end.isPending} onClick={() => { if (window.confirm('End this lease? No more rent will be raised for it.')) end.mutate(l.id); }}>End lease</Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => openStatement(l.id)}>Statement</Button>
                {l.status === 'ENDED' && l.depositAmount > 0 && (l.depositSettledAt
                  ? <span className="whitespace-nowrap text-xs text-muted" title={l.depositNotes ?? undefined}>Deposit: {kes(l.depositAmount - l.depositDeduction)} refunded{l.depositDeduction > 0 ? `, ${kes(l.depositDeduction)} kept` : ''}</span>
                  : <Button variant="secondary" onClick={() => setSettling(l)}>Settle deposit</Button>)}
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
    <Modal open={!!renewing} onClose={() => setRenewing(null)} title="Renew lease">
      {renewing && <RenewLeaseForm lease={renewing} onDone={() => setRenewing(null)} />}
    </Modal>
    <Modal open={!!lettering} onClose={() => setLettering(null)} title="Letter to tenant">
      {lettering && <LeaseLetterForm lease={lettering} onDone={() => setLettering(null)} />}
    </Modal>
    <Modal open={!!settling} onClose={() => setSettling(null)} title="Settle security deposit">
      {settling && <SettleDepositForm lease={settling} onDone={() => setSettling(null)} />}
    </Modal>
    </>
  );
}

function Vacancies() {
  const { data, isLoading } = useQuery({ queryKey: ['rent', 'vacancies'], queryFn: () => api.get<VacancyReport>('/rent/vacancies') });
  if (isLoading) return <Spinner />;
  if (!data?.rows.length) return <EmptyState icon={<KeyRound size={22} />} title="No vacant units" body="Every rental listing that is on the market has an active lease." />;
  return (
    <div className="space-y-4">
      <Stat label="Rent forgone each month" value={kes(data.monthlyLoss)} sub={`${data.rows.length} empty unit${data.rows.length === 1 ? '' : 's'}`} />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3">Property</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">Asking rent</th>
            <th className="px-4 py-3 text-right">Empty for</th><th className="px-4 py-3">Last tenant</th>
          </tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.propertyId} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{r.propertyTitle}</td>
                <td className="px-4 py-3">{r.location}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">{kes(r.rent)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right"><Badge tone={r.daysVacant > 60 ? 'danger' : r.daysVacant > 30 ? 'warn' : 'neutral'}>{r.daysVacant} days</Badge></td>
                <td className="px-4 py-3">{r.lastTenant ?? 'Never let'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Arrears() {
  const { user } = useAuth();
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
            <th className="px-4 py-3 text-right">Owed</th><th className="px-4 py-3 text-right">Days late</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3" />
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
                <td className="px-4 py-3 text-right">
                  {r.tenantPhone && (
                    <a
                      className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-cypress-700 hover:bg-sunk"
                      target="_blank" rel="noreferrer"
                      href={whatsappLink(r.tenantPhone, rentReminderMessage({
                        tenantName: r.tenantName, propertyTitle: r.propertyTitle, period: r.period, dueDate: r.dueDate,
                        balance: r.balance, daysOverdue: r.daysOverdue, agencyName: user?.organizationName ?? '',
                      }))}
                    >
                      <MessageCircle size={14} /> Remind
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AutoSend() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rent', 'schedule'], queryFn: () => api.get<{ day: number | null }>('/rent/statement-schedule') });
  const save = useMutation({
    mutationFn: (day: number | null) => api.put('/rent/statement-schedule', { day }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rent', 'schedule'] }),
  });
  if (q.isLoading) return null;
  const day = q.data?.day ?? null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Send statements automatically</p>
        <p className="mt-0.5 text-xs text-muted">
          {day ? `On day ${day} of each month, every landlord with an email gets last month's statement and their private link.` : 'Off. Turn it on and landlords are emailed last month\'s statement on the day you choose. It never sends the moment you switch it on.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={day ?? ''} onChange={(e) => save.mutate(e.target.value ? Number(e.target.value) : null)} disabled={save.isPending} aria-label="Day of the month">
          <option value="">Off</option>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Day {d}</option>)}
        </Select>
      </div>
    </Card>
  );
}

function PortalLink({ ownerId }: { ownerId: string }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const link = useQuery({ queryKey: ['rent', 'portal', ownerId], queryFn: () => api.get<{ token: string | null }>(`/rent/owners/${ownerId}/portal-link`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['rent', 'portal', ownerId] });
  const create = useMutation({ mutationFn: () => api.post(`/rent/owners/${ownerId}/portal-link`), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: () => api.del(`/rent/owners/${ownerId}/portal-link`), onSuccess: refresh });
  if (link.isLoading) return null;
  const token = link.data?.token;
  const url = token ? `${window.location.origin}/portal/${token}` : '';
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-ink">Landlord link</p>
      <p className="mt-0.5 text-xs text-muted">A private, read-only page where this landlord sees their statements, units and open repairs. No login. Anyone with the link can view it, so share it only with them.</p>
      {token ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input readOnly value={url} className="min-w-0 flex-1 bg-sunk text-muted" onFocus={(e) => e.target.select()} />
          <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</Button>
          <Button variant="secondary" disabled={create.isPending} onClick={() => { if (confirm('Make a new link? The old one will stop working.')) create.mutate(); }}>New link</Button>
          <Button variant="ghost" disabled={revoke.isPending} onClick={() => { if (confirm('Turn off this landlord\'s link?')) revoke.mutate(); }}>Turn off</Button>
        </div>
      ) : (
        <Button className="mt-3" variant="secondary" disabled={create.isPending} onClick={() => create.mutate()}>Create link</Button>
      )}
    </Card>
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
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const fail = (err: unknown) => setNotice({ ok: false, text: err instanceof ApiError ? err.message : 'Could not send' });
  const emailOne = useMutation({
    mutationFn: () => api.post<{ to: string }>(`/rent/statements/${ownerId}/email`, { period }),
    onSuccess: (r) => setNotice({ ok: true, text: `Statement and link sent to ${r.to}` }),
    onError: fail,
  });
  const emailAll = useMutation({
    mutationFn: () => api.post<{ sent: number; noEmail: number; nothingToSend: number; failed: number }>('/rent/statements/email-all', { period }),
    onSuccess: (r) => setNotice({
      ok: r.failed === 0,
      text: `${r.sent} sent` + (r.noEmail ? `, ${r.noEmail} landlords have no email` : '') + (r.nothingToSend ? `, ${r.nothingToSend} had no rent this month` : '') + (r.failed ? `, ${r.failed} failed (is email set up?)` : ''),
    }),
    onError: fail,
  });
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
          <Button variant="secondary" disabled={emailOne.isPending} onClick={() => { setNotice(null); emailOne.mutate(); }}>
            <Mail size={15} /> {emailOne.isPending ? 'Sending…' : 'Email landlord'}
          </Button>
        )}
        <Button variant="secondary" disabled={emailAll.isPending} onClick={() => {
          if (confirm(`Email every landlord their ${periodLabel(period)} statement, with their private link?`)) { setNotice(null); emailAll.mutate(); }
        }}>
          <Mail size={15} /> {emailAll.isPending ? 'Sending…' : 'Email all landlords'}
        </Button>
        {s && s.lines.length > 0 && (
          <Button variant="secondary" onClick={() => api.download(`/rent/statements/${ownerId}?period=${period}&format=csv`, 'statement.csv')}>
            <Download size={15} /> Download CSV
          </Button>
        )}
      </div>
      <AutoSend />
      {notice && <p className={`text-sm ${notice.ok ? 'text-cypress-700' : 'text-danger'}`}>{notice.text}</p>}
      {ownerId && <PortalLink ownerId={ownerId} />}
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
              {s.deductions.map((d) => (
                <tr key={d.requestId} className="border-b border-line text-muted">
                  <td className="px-4 py-3" colSpan={6}>Repair charged to landlord: {d.title} ({d.propertyTitle})</td>
                  <td className="px-4 py-3 text-right">− {kes(d.amount)}</td>
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
