import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardCheck, CreditCard, Link2, Plus, UserPlus, Wrench } from 'lucide-react';
import { can, type LeaseItem, type MaintenanceItem, type MaintenanceStatus, type TenantStatement, type TenantStatementRow } from '@kaya/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { money as kes } from '../lib/currency';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Spinner } from './ui/Spinner';
import { ContactActions } from './ContactActions';
import { NewLeaseForm } from '../forms/NewLeaseForm';
import { MaintenanceForm } from '../forms/MaintenanceForm';
import { RecordRentPaymentForm } from '../forms/RecordRentPaymentForm';
import { LeaseChecklist } from '../forms/LeaseChecklist';
import { TenantLink } from '../pages/rent/RentPage';

const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ');
const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
const monthShort = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString('en-KE', { month: 'short' });
const monthLong = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
const OPEN = (i: MaintenanceItem) => i.status === 'OPEN' || i.status === 'IN_PROGRESS';
const RAIL = { URGENT: 'bg-danger', HIGH: 'bg-danger', MEDIUM: 'bg-warn', LOW: 'bg-line' } as const;

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The unit's current tenancy and open repairs. Shared by the plan at the top of the page and the cards below it. */
export function useUnitData(propertyId: string) {
  const { user } = useAuth();
  const seeRent = !!user && can(user.role, 'rent:view');
  const seeRepairs = !!user && can(user.role, 'maintenance:view');
  const leases = useQuery({ queryKey: ['unit', propertyId, 'lease'], enabled: seeRent, queryFn: () => api.get<LeaseItem[]>('/rent/leases', { status: 'ACTIVE' }) });
  const issues = useQuery({ queryKey: ['unit', propertyId, 'issues'], enabled: seeRepairs, queryFn: () => api.get<MaintenanceItem[]>('/maintenance', { propertyId }) });
  const lease = leases.data?.find((l) => l.propertyId === propertyId) ?? null;
  const open = (issues.data ?? []).filter(OPEN);
  return { lease, open, openIssues: open.length, leases, issues };
}

/** One strip of squares, a month each, so a tenant's record reads at a glance. */
function Timeline({ rows }: { rows: TenantStatementRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ol className="grid grid-flow-col auto-cols-fr gap-1.5" aria-label="Rent paid, month by month">
      {rows.map((r) => {
        const owing = r.charged - r.paid;
        const state = owing <= 0 ? 'paid' : r.paid > 0 ? 'part' : r.dueDate > today ? 'upcoming' : 'unpaid';
        const cls = { paid: 'bg-ink text-white', part: 'border border-warn/50 bg-[#fdf5e6] text-warn', unpaid: 'border border-danger/40 bg-[#fbefed] text-danger', upcoming: 'border border-dashed border-line text-faint' }[state];
        return (
          <li key={r.period} className="flex flex-col items-center gap-1" title={`${monthLong(r.period)}: ${state === 'paid' ? 'paid' : state === 'part' ? `owes ${kes(owing)}` : state === 'unpaid' ? 'unpaid' : 'not yet due'}`}>
            <span className={`flex h-8 w-full max-w-[2.4rem] items-center justify-center rounded-control text-xs font-semibold ${cls}`}>
              {state === 'paid' ? <Check size={14} strokeWidth={2.5} /> : state === 'upcoming' ? '' : '!'}
            </span>
            <span className="text-[0.65rem] uppercase tracking-wide text-faint">{monthShort(r.period)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, icon, action, children, flag }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; flag?: boolean }) {
  return (
    <Card className={`overflow-hidden ${flag ? 'border-danger/40' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold tracking-tight text-ink">{icon}{title}</h2>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </Card>
  );
}

/** Owns the unit's data and dialogs, and hands back the two columns to place on the page. */
export function UnitDesk({ propertyId, suggestedRent, children }: {
  propertyId: string; suggestedRent: number; children: (parts: { main: ReactNode; side: ReactNode }) => ReactNode;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'lease' | 'issue' | 'link' | 'checklist' | null>(null);
  const [editing, setEditing] = useState<MaintenanceItem | null>(null);
  const [paying, setPaying] = useState<TenantStatementRow | null>(null);
  const seeRent = !!user && can(user.role, 'rent:view');
  const canPay = !!user && can(user.role, 'rent:create');
  const seeRepairs = !!user && can(user.role, 'maintenance:view');
  const { lease, leases, issues } = useUnitData(propertyId);

  const statement = useQuery({ queryKey: ['unit', propertyId, 'statement', lease?.id], enabled: !!lease, queryFn: () => api.get<TenantStatement>(`/rent/leases/${lease!.id}/statement`) });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MaintenanceStatus }) => api.patch(`/maintenance/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['unit', propertyId, 'issues'] }); qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['buildings'] }); },
  });

  if (!seeRent && !seeRepairs) return <>{children({ main: null, side: null })}</>;

  const all = issues.data ?? [];
  const open = all.filter(OPEN);
  const done = all.filter((i) => !OPEN(i));
  const rows = statement.data?.rows ?? [];
  const balance = statement.data?.totals.balance ?? 0;
  const oldestOwing = rows.find((r) => r.charged - r.paid > 0) ?? null;
  const recent = rows.slice(-12);

  const rentCard = seeRent && (
    <Section title="Rent and payments" action={lease && canPay && oldestOwing ? <Button onClick={() => setPaying(oldestOwing)}><CreditCard size={14} /> Record payment</Button> : undefined}>
      {leases.isLoading ? <Spinner /> : !lease ? (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent"><UserPlus size={20} /></span>
          <p className="mt-4 text-base font-medium text-ink">This unit has no tenant</p>
          <p className="mt-1 max-w-sm text-sm text-muted">Assign one to start raising rent every month, track what they pay, and give them their own page.</p>
          {canPay && <Button className="mt-5" onClick={() => setModal('lease')}><Plus size={14} /> Assign a tenant</Button>}
        </div>
      ) : statement.isLoading ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-muted">No rent has been charged yet. It is raised on the 1st of each month.</p>
      ) : (
        <>
          <Timeline rows={recent} />
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-ink" /> Paid</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-warn/50 bg-[#fdf5e6]" /> Part paid</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm border border-danger/40 bg-[#fbefed]" /> Unpaid</span>
          </div>
          <div className="-mx-5 mt-5 overflow-x-auto border-t border-line sm:-mx-6">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-faint"><th className="px-5 py-3 font-medium sm:px-6">Month</th><th className="hidden px-3 py-3 text-right font-medium sm:table-cell">Charged</th><th className="px-3 py-3 text-right font-medium">Paid</th><th className="px-5 py-3 text-right font-medium sm:px-6">Balance</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...rows].reverse().slice(0, 6).map((r) => {
                  const owing = r.charged - r.paid;
                  return (
                    <tr key={r.period}>
                      <td className="whitespace-nowrap px-5 py-3 font-medium text-ink sm:px-6"><span className="sm:hidden">{monthShort(r.period)} {r.period.slice(0, 4)}</span><span className="hidden sm:inline">{monthLong(r.period)}</span></td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted sm:table-cell">{kes(r.charged)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted">{kes(r.paid)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right sm:px-6">
                        {owing <= 0 ? <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-deep"><Check size={13} /> Paid</span> : (
                          <span className="inline-flex items-center gap-2">
                            <span className={`font-medium tabular-nums ${r.paid > 0 ? 'text-warn' : 'text-danger'}`}>{kes(owing)}</span>
                            {canPay && <button type="button" onClick={() => setPaying(r)} className="text-xs font-medium text-accent hover:underline">Record</button>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );

  const repairsCard = seeRepairs && (
    <Section title="Repairs and issues" flag={open.length > 0} icon={<Wrench size={16} className={open.length ? 'text-danger' : 'text-faint'} />}
      action={<Button variant="secondary" onClick={() => setModal('issue')}><Plus size={14} /> Report an issue</Button>}>
      {issues.isLoading ? <Spinner /> : all.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sunk text-faint"><Wrench size={20} /></span>
          <p className="mt-4 text-base font-medium text-ink">Nothing needs fixing</p>
          <p className="mt-1 max-w-sm text-sm text-muted">When the tenant reports a problem from their page it appears here, and a pin marks the room on the plan above.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {[...open, ...done].map((i) => {
            const live = OPEN(i);
            return (
              <li key={i.id} className={`flex overflow-hidden rounded-control border ${live ? 'border-line bg-white' : 'border-line bg-sunk/60'}`}>
                <span className={`w-1 shrink-0 ${live ? RAIL[i.priority] : 'bg-line'}`} aria-hidden />
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => setEditing(i)}>
                      <span className={`block text-sm font-medium ${live ? 'text-ink' : 'text-muted line-through'}`}>{i.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">{nice(i.category)} · {nice(i.priority)} priority · {ago(i.createdAt)}{i.tenantName ? ` · reported by ${i.tenantName}` : ''}</span>
                    </button>
                    <div className="inline-flex shrink-0 rounded-control border border-line bg-sunk p-0.5 text-xs font-medium" role="group" aria-label={`Status of ${i.title}`}>
                      {([['OPEN', 'Open'], ['IN_PROGRESS', 'In progress'], ['DONE', 'Fixed']] as const).map(([s, label]) => (
                        <button key={s} type="button" disabled={setStatus.isPending} aria-pressed={i.status === s} onClick={() => i.status !== s && setStatus.mutate({ id: i.id, status: s })}
                          className={`rounded-[5px] px-2.5 py-1 transition ${i.status === s ? (s === 'DONE' ? 'bg-ink text-white shadow-card' : s === 'IN_PROGRESS' ? 'bg-white text-warn shadow-card' : 'bg-white text-danger shadow-card') : 'text-muted hover:text-ink'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );

  const side = seeRent && (
    <Card className="overflow-hidden">
      {lease ? (
        <>
          <div className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{initials(lease.tenantName)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{lease.tenantName}</p>
                <p className="text-xs text-muted">Tenant since {new Date(lease.startDate).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}</p>
              </div>
              <TenantContact tenantId={lease.tenantId} name={lease.tenantName} />
            </div>
            <div className="mt-5 rounded-control bg-sunk p-4">
              <p className="text-xs text-muted">Balance owed</p>
              <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${balance > 0 ? 'text-danger' : 'text-ink'}`}>{statement.isLoading ? '…' : kes(balance)}</p>
              <p className="mt-0.5 text-xs text-muted">{balance > 0 ? `Oldest unpaid: ${oldestOwing ? monthLong(oldestOwing.period) : ''}` : 'Paid up to date'}</p>
            </div>
            <dl className="mt-5 space-y-3 text-sm">
              {[
                ['Monthly rent', kes(lease.rentAmount)],
                ['Due on', `Day ${lease.dueDay} of the month`],
                ['Deposit held', lease.depositAmount ? kes(lease.depositAmount) : 'None recorded'],
                ['Lease ends', lease.endDate ? new Date(lease.endDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Open-ended'],
              ].map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium tabular-nums text-ink">{v}</dd></div>)}
            </dl>
          </div>
          <div className="grid gap-px border-t border-line bg-line">
            {[
              [Link2, 'Tenant portal link', () => setModal('link')],
              [ClipboardCheck, 'Move-in / move-out checklist', () => setModal('checklist')],
            ].map(([Icon, label, go]) => { const I = Icon as typeof Link2; return (
              <button key={label as string} type="button" onClick={go as () => void} className="flex items-center gap-3 bg-white px-5 py-3 text-left text-sm font-medium text-ink transition hover:bg-sunk">
                <I size={16} className="text-muted" /> {label as string}
              </button>
            ); })}
          </div>
        </>
      ) : (
        <div className="p-5">
          <p className="text-xs uppercase tracking-wide text-faint">Vacant</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-ink">{suggestedRent ? kes(suggestedRent) : '—'}</p>
          <p className="text-xs text-muted">{suggestedRent ? 'asking rent per month' : 'no rent set'}</p>
          {canPay && <Button className="mt-5 w-full justify-center" onClick={() => setModal('lease')}><UserPlus size={14} /> Assign a tenant</Button>}
        </div>
      )}
    </Card>
  );

  return (
    <>
      {children({ main: <>{rentCard}{repairsCard}</>, side })}
      <Modal open={modal === 'lease'} onClose={() => setModal(null)} title="Assign a tenant" width="max-w-xl">
        {modal === 'lease' && <NewLeaseForm propertyId={propertyId} suggestedRent={suggestedRent} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={modal === 'issue'} onClose={() => setModal(null)} title="Report an issue">
        {modal === 'issue' && <MaintenanceForm propertyId={propertyId} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={modal === 'link'} onClose={() => setModal(null)} title="Tenant link">
        {modal === 'link' && lease && <TenantLink lease={lease} />}
      </Modal>
      <Modal open={modal === 'checklist'} onClose={() => setModal(null)} title="Move-in and move-out checklist">
        {modal === 'checklist' && lease && <LeaseChecklist lease={lease} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Update issue">
        {editing && <MaintenanceForm item={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!paying} onClose={() => setPaying(null)} title="Record rent payment">
        {paying && lease && <RecordRentPaymentForm charge={{ id: paying.chargeId, tenantName: lease.tenantName, propertyTitle: lease.propertyTitle, period: paying.period, balance: paying.charged - paying.paid }} onDone={() => setPaying(null)} />}
      </Modal>
    </>
  );
}

function TenantContact({ tenantId, name }: { tenantId: string; name: string }) {
  const { data } = useQuery({ queryKey: ['unit', 'tenant', tenantId], queryFn: () => api.get<{ phone: string | null }>(`/clients/${tenantId}`) });
  return data?.phone ? <ContactActions phone={data.phone} name={name} size={30} /> : null;
}
