import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Wrench } from 'lucide-react';
import { can, type LeaseItem, type MaintenanceItem, type MaintenanceStatus, type TenantStatement } from '@kaya/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { money as kes } from '../lib/currency';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Spinner } from './ui/Spinner';
import { ContactActions } from './ContactActions';
import { NewLeaseForm } from '../forms/NewLeaseForm';
import { MaintenanceForm } from '../forms/MaintenanceForm';
import { TenantLink } from '../pages/rent/RentPage';

const PRIORITY_TONE = { URGENT: 'danger', HIGH: 'warn', MEDIUM: 'neutral', LOW: 'neutral' } as const;
const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ');

/** The unit's current tenancy and open repairs. Shared by the picture at the top of the page and the cards below it. */
export function useUnitData(propertyId: string) {
  const { user } = useAuth();
  const seeRent = !!user && can(user.role, 'rent:view');
  const seeRepairs = !!user && can(user.role, 'maintenance:view');
  const leases = useQuery({ queryKey: ['unit', propertyId, 'lease'], enabled: seeRent, queryFn: () => api.get<LeaseItem[]>('/rent/leases', { status: 'ACTIVE' }) });
  const issues = useQuery({ queryKey: ['unit', propertyId, 'issues'], enabled: seeRepairs, queryFn: () => api.get<MaintenanceItem[]>('/maintenance', { propertyId }) });
  const lease = leases.data?.find((l) => l.propertyId === propertyId) ?? null;
  const openIssues = (issues.data ?? []).filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS').length;
  return { lease, openIssues, leases, issues };
}

/** Everything about who lives in this unit: tenant, rent history, tenant link, and repairs raised against it. */
export function UnitTenancy({ propertyId, suggestedRent }: { propertyId: string; suggestedRent: number }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal] = useState<'lease' | 'issue' | 'link' | null>(null);
  const [editing, setEditing] = useState<MaintenanceItem | null>(null);
  const seeRent = !!user && can(user.role, 'rent:view');
  const seeRepairs = !!user && can(user.role, 'maintenance:view');

  const { lease, leases, issues } = useUnitData(propertyId);
  const statement = useQuery({ queryKey: ['unit', propertyId, 'statement', lease?.id], enabled: !!lease, queryFn: () => api.get<TenantStatement>(`/rent/leases/${lease!.id}/statement`) });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MaintenanceStatus }) => api.patch(`/maintenance/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['unit', propertyId, 'issues'] }); qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['buildings'] }); },
  });

  if (!seeRent && !seeRepairs) return null;
  const open = (issues.data ?? []).filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  const done = (issues.data ?? []).filter((i) => i.status !== 'OPEN' && i.status !== 'IN_PROGRESS');
  const rows = (statement.data?.rows ?? []).slice(-6).reverse();
  const balance = statement.data?.totals.balance ?? 0;

  return (
    <>
      {seeRent && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Tenant</h2>
            {lease && <Button variant="secondary" onClick={() => setModal('link')}><Link2 size={14} /> Tenant portal link</Button>}
          </div>
          {leases.isLoading ? <Spinner /> : !lease ? (
            <div className="rounded-control border border-dashed border-line bg-sunk/50 p-6 text-center">
              <p className="text-sm text-muted">Nobody is renting this unit yet.</p>
              <Button className="mt-3" onClick={() => setModal('lease')}><Plus size={14} /> Assign a tenant</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-base font-medium text-ink">{lease.tenantName}<TenantContact tenantId={lease.tenantId} name={lease.tenantName} /></p>
                  <p className="text-sm text-muted">{kes(lease.rentAmount)} a month · due day {lease.dueDay} · since {lease.startDate}{lease.endDate ? ` · ends ${lease.endDate}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Balance</p>
                  <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? 'text-danger' : 'text-ok'}`}>{balance > 0 ? kes(balance) : 'Paid up'}</p>
                </div>
              </div>
              <h3 className="mb-2 mt-5 text-sm font-semibold text-ink">Payment history</h3>
              {statement.isLoading ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-muted">No rent has been charged yet.</p> : (
                <ul className="divide-y divide-line rounded-control border border-line text-sm">
                  {rows.map((r) => {
                    const owing = r.charged - r.paid;
                    return (
                      <li key={r.period} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="text-ink">{r.period}</span>
                        <span className="text-xs text-muted">{kes(r.paid)} of {kes(r.charged)}</span>
                        <Badge tone={owing <= 0 ? 'ok' : r.paid > 0 ? 'warn' : 'danger'}>{owing <= 0 ? 'Paid' : r.paid > 0 ? `Owes ${kes(owing)}` : 'Unpaid'}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs"><Link to="/rent" className="text-accent hover:underline">Record a payment or see the full statement on the Rent page</Link></p>
            </>
          )}
        </Card>
      )}

      {seeRepairs && (
        <Card className={`p-5 ${open.length ? 'border-danger/40' : ''}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink"><Wrench size={17} className={open.length ? 'text-danger' : 'text-muted'} /> Repairs and issues</h2>
            <Button variant="secondary" onClick={() => setModal('issue')}><Plus size={14} /> Report an issue</Button>
          </div>
          {issues.isLoading ? <Spinner /> : (issues.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nothing reported for this unit. When the tenant reports a problem from their link, it shows up here and on the building map.</p>
          ) : (
            <ul className="space-y-2">
              {[...open, ...done].map((i) => (
                <li key={i.id} className={`rounded-control border p-3 text-sm ${i.status === 'OPEN' || i.status === 'IN_PROGRESS' ? 'border-danger/30 bg-[#fdf6f5]' : 'border-line opacity-75'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button type="button" className="min-w-0 text-left" onClick={() => setEditing(i)}>
                      <span className="block font-medium text-ink">{i.title}</span>
                      <span className="block text-xs text-muted">{nice(i.category)} · {new Date(i.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}{i.tenantName ? ` · reported by ${i.tenantName}` : ''}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge tone={PRIORITY_TONE[i.priority]}>{nice(i.priority)}</Badge>
                      <Badge tone={i.status === 'OPEN' ? 'danger' : i.status === 'IN_PROGRESS' ? 'warn' : 'ok'}>{nice(i.status)}</Badge>
                    </div>
                  </div>
                  {(i.status === 'OPEN' || i.status === 'IN_PROGRESS') && (
                    <div className="mt-2 flex gap-2">
                      {i.status === 'OPEN' && <Button variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: i.id, status: 'IN_PROGRESS' })}>Start work</Button>}
                      <Button variant="secondary" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: i.id, status: 'DONE' })}>Mark fixed</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal open={modal === 'lease'} onClose={() => setModal(null)} title="Assign a tenant" width="max-w-xl">
        {modal === 'lease' && <NewLeaseForm propertyId={propertyId} suggestedRent={suggestedRent} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={modal === 'issue'} onClose={() => setModal(null)} title="Report an issue">
        {modal === 'issue' && <MaintenanceForm propertyId={propertyId} onDone={() => setModal(null)} />}
      </Modal>
      <Modal open={modal === 'link'} onClose={() => setModal(null)} title="Tenant link">
        {modal === 'link' && lease && <TenantLink lease={lease} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Update issue">
        {editing && <MaintenanceForm item={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function TenantContact({ tenantId, name }: { tenantId: string; name: string }) {
  const { data } = useQuery({ queryKey: ['unit', 'tenant', tenantId], queryFn: () => api.get<{ phone: string | null }>(`/clients/${tenantId}`) });
  return data?.phone ? <ContactActions phone={data.phone} name={name} size={26} /> : null;
}
