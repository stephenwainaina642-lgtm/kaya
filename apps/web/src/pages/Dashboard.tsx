import { useQuery } from '@tanstack/react-query';
import { can, formatMoney, planHasModule, periodLabel } from '@kaya/shared';
import type { DashboardData, AttentionItem, RentSummary } from '@kaya/shared';
import { Link } from 'react-router-dom';
import { CalendarClock, Users, UserCircle, Handshake } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { NextActionsWidget } from '../components/ai/NextActionsWidget';
import { OnboardingChecklist } from '../components/OnboardingChecklist';

const ATTENTION_ACCENT: Record<AttentionItem['kind'], string> = {
  STALLED_DEAL: 'border-l-brass',
  OVERDUE_FOLLOW_UP: 'border-l-warn',
  OVERDUE_TASK: 'border-l-danger',
  UNASSIGNED_LEAD: 'border-l-cypress-500',
};

function RentCard() {
  const { user } = useAuth();
  const allowed = !!user && planHasModule(user.plan, 'rentManagement') && can(user.role, 'rent:view');
  const { data } = useQuery({ queryKey: ['rent', 'summary'], queryFn: () => api.get<RentSummary>('/rent/summary'), enabled: allowed });
  if (!allowed || !data) return null;
  const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
  const pct = Math.round(data.collectionRate * 100);
  const tiles: { label: string; value: string; note: string; to: string; tone?: 'danger' | 'warn' }[] = [
    { label: 'Overdue', value: kes(data.overdueTotal), note: data.overdueTenants ? `${data.overdueTenants} tenant${data.overdueTenants === 1 ? '' : 's'}` : 'All paid up', to: '/rent', tone: data.overdueTotal > 0 ? 'danger' : undefined },
    { label: 'Vacant units', value: String(data.vacantUnits), note: data.vacantUnits ? `${kes(data.monthlyLoss)} a month forgone` : 'Fully let', to: '/rent', tone: data.vacantUnits > 0 ? 'warn' : undefined },
    { label: 'Leases ending soon', value: String(data.expiringSoon), note: 'Within 60 days', to: '/rent', tone: data.expiringSoon > 0 ? 'warn' : undefined },
    { label: 'Open repairs', value: String(data.openRepairs), note: data.urgentRepairs ? `${data.urgentRepairs} urgent` : 'None urgent', to: '/maintenance', tone: data.urgentRepairs > 0 ? 'danger' : undefined },
  ];
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Rent · {periodLabel(data.period)}</h2>
          <p className="text-sm text-muted">{kes(data.collected)} collected of {kes(data.expected)} due</p>
        </div>
        <Link to="/rent" className="text-sm font-medium text-cypress-700 hover:underline">Open rent roll</Link>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Rent collected">
        <div className="h-full rounded-full bg-cypress-600" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="rounded-control border border-line p-3 transition hover:bg-sunk">
            <p className="text-xs uppercase tracking-wide text-muted">{t.label}</p>
            <p className={`mt-1 font-display text-xl font-semibold ${t.tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{t.value}</p>
            <p className="mt-0.5 text-xs text-muted">{t.note}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function SecondaryStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="flex flex-1 items-center gap-3 px-5 py-4 first:pl-0 last:pr-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-cypress-50 text-cypress-700">
        <Icon size={17} strokeWidth={2} />
      </div>
      <div>
        <p className="font-display text-2xl font-semibold text-ink">{value}</p>
        <p className="mt-0.5 text-sm text-muted">{label}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'KES';
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Your agency at a glance" />
        <Spinner />
      </>
    );
  }

  const { kpis, attention, schedule, revenueTrend, pipeline, leadSources } = data;
  const totalLeadSources = leadSources.reduce((sum, s) => sum + s.count, 0) || 1;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your agency at a glance" />
      <div className="space-y-6 p-8">
        <OnboardingChecklist />
        <RentCard />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-panel bg-ink p-6 text-white lg:col-span-1">
            <span className="block h-[3px] w-6 bg-brass" />
            <p className="mt-4 text-sm text-white/60">Pipeline value</p>
            <p className="mt-1 font-display text-4xl font-semibold text-white">{formatMoney(kpis.pipelineValue, currency, { compact: true })}</p>
          </div>
          <Card className="flex divide-x divide-line p-0 lg:col-span-2">
            <SecondaryStat label="Active leads" value={String(kpis.activeLeads)} icon={Users} />
            <SecondaryStat label="Active clients" value={String(kpis.activeClients)} icon={UserCircle} />
            <SecondaryStat label="Deals in progress" value={String(kpis.dealsInProgress)} icon={Handshake} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Needs attention</h2>
            {attention.length === 0 ? (
              <EmptyState title="All caught up" body="Nothing urgent needs your attention right now." />
            ) : (
              <ul className="divide-y divide-line">
                {attention.map((item) => (
                  <li key={item.id} className={`flex items-center gap-3 border-l-2 py-3 pl-3 ${ATTENTION_ACCENT[item.kind]}`}>
                    <div className="min-w-0 flex-1">
                      <Link to={item.link} className="block truncate text-sm font-medium text-ink hover:text-cypress-700">
                        {item.title}
                      </Link>
                      {item.subtitle && <p className="truncate text-xs text-muted">{item.subtitle}</p>}
                    </div>
                    <span className="shrink-0"><Badge>{item.kind.replace(/_/g, ' ').toLowerCase()}</Badge></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <CalendarClock size={18} /> Upcoming
            </h2>
            {schedule.length === 0 ? (
              <EmptyState title="Nothing scheduled" />
            ) : (
              <ul className="space-y-3">
                {schedule.slice(0, 8).map((item) => (
                  <li key={item.id} className="text-sm">
                    <Link to={item.link} className="font-medium text-ink hover:text-cypress-700">{item.title}</Link>
                    <p className="text-xs text-muted">
                      {new Date(item.at).toLocaleString('en-KE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                      {item.subtitle ? ` · ${item.subtitle}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <NextActionsWidget />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Lead pipeline</h2>
            <ul className="space-y-2">
              {pipeline.map((stage) => (
                <li key={stage.status} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{stage.status.replace(/_/g, ' ')}</span>
                  <span className="font-medium text-ink">{stage.count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Lead sources</h2>
            <ul className="space-y-2">
              {leadSources.map((s) => (
                <li key={s.source} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{s.source.replace(/_/g, ' ')}</span>
                  <span className="font-medium text-ink">{s.count} ({Math.round((s.count / totalLeadSources) * 100)}%)</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Revenue trend (commission)</h2>
            <ul className="space-y-2">
              {revenueTrend.map((pt) => (
                <li key={pt.month} className="flex items-center justify-between text-sm">
                  <span className="text-muted">{pt.month}</span>
                  <span className="font-medium text-ink">{formatMoney(pt.commissionEarned, currency, { compact: true })}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
