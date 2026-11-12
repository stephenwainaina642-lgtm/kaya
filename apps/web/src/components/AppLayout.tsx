import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, UserCircle, Building2, Landmark, CalendarClock, ListChecks,
  Handshake, Wallet, Calendar, MessageSquare, FileText, BarChart3, UsersRound, Settings, LogOut, Menu, X, ShieldCheck, LineChart, Workflow, KeyRound, Wrench, Hotel, Search,
} from 'lucide-react';
import { can, planHasModule, type DashboardData, type Permission } from '@kaya/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from './ui/Avatar';
import { GuideAssistant } from './GuideAssistant';
import { BrandMark } from './BrandMark';
import { QuickAdd } from './QuickAdd';
import { CommandPalette, type PalettePage } from './CommandPalette';

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; end?: boolean; module?: 'dealsPipeline' | 'rentManagement' | 'analytics' | 'automation' | 'auditLog'; permission?: Permission };

// Grouped so a 20-item list reads as three short ones. Titles are quiet, sentence case.
const NAV_GROUPS: { titleKey?: string; title?: string; items: NavItem[] }[] = [
  { items: [{ to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true, permission: 'dashboard:view' }] },
  {
    titleKey: 'nav.group.sales', title: 'Sales',
    items: [
      { to: '/leads', labelKey: 'nav.leads', icon: Users },
      { to: '/clients', labelKey: 'nav.clients', icon: UserCircle },
      { to: '/viewings', labelKey: 'nav.viewings', icon: CalendarClock },
      { to: '/follow-ups', labelKey: 'nav.followUps', icon: ListChecks },
      { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
      { to: '/deals', labelKey: 'nav.deals', icon: Handshake, module: 'dealsPipeline' },
      { to: '/commissions', labelKey: 'nav.commissions', icon: Wallet, module: 'dealsPipeline' },
    ],
  },
  {
    titleKey: 'nav.group.portfolio', title: 'Portfolio',
    items: [
      { to: '/properties', labelKey: 'nav.properties', icon: Building2 },
      { to: '/buildings', labelKey: 'nav.buildings', icon: Hotel },
      { to: '/owners', labelKey: 'nav.owners', icon: Landmark },
      { to: '/rent', labelKey: 'nav.rent', icon: KeyRound, module: 'rentManagement', permission: 'rent:view' },
      { to: '/maintenance', labelKey: 'nav.maintenance', icon: Wrench, module: 'rentManagement', permission: 'maintenance:view' },
    ],
  },
  {
    titleKey: 'nav.group.workspace', title: 'Workspace',
    items: [
      { to: '/calendar', labelKey: 'nav.calendar', icon: Calendar },
      { to: '/communications', labelKey: 'nav.communications', icon: MessageSquare },
      { to: '/documents', labelKey: 'nav.documents', icon: FileText },
      { to: '/reports', labelKey: 'nav.reports', icon: BarChart3 },
      { to: '/analytics', labelKey: 'nav.analytics', icon: LineChart, module: 'analytics' },
      { to: '/automation', labelKey: 'nav.automation', icon: Workflow, module: 'automation' },
      { to: '/audit-log', labelKey: 'nav.auditLog', icon: ShieldCheck, module: 'auditLog' },
      { to: '/team', labelKey: 'nav.team', icon: UsersRound },
      { to: '/settings', labelKey: 'nav.settings', icon: Settings },
    ],
  },
];

/** The screens this person can see, flattened, so the same rules drive the sidebar and the search palette. */
function useVisibleItems() {
  const { user } = useAuth();
  const visible = (item: NavItem) =>
    (!item.module || !user || planHasModule(user.plan, item.module)) && (item.permission ? !user || can(user.role, item.permission) : user?.role !== 'CARETAKER');
  return { visible };
}

/** Live numbers beside Leads, Follow-ups and Tasks, from the dashboard data that is already loaded. */
function useNavCounts(): Record<string, { n: number; tone: 'accent' | 'danger' } | undefined> {
  const { user } = useAuth();
  const allowed = !!user && can(user.role, 'dashboard:view');
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard'), enabled: allowed, staleTime: 60_000 });
  if (!data) return {};
  const count = (kind: string) => data.attention.filter((a) => a.kind === kind).length;
  const out: Record<string, { n: number; tone: 'accent' | 'danger' } | undefined> = {};
  if (data.kpis.activeLeads > 0) out['/leads'] = { n: data.kpis.activeLeads, tone: 'accent' };
  if (count('OVERDUE_FOLLOW_UP') > 0) out['/follow-ups'] = { n: count('OVERDUE_FOLLOW_UP'), tone: 'danger' };
  if (count('OVERDUE_TASK') > 0) out['/tasks'] = { n: count('OVERDUE_TASK'), tone: 'danger' };
  return out;
}

function SidebarContent({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { visible } = useVisibleItems();
  const counts = useNavCounts();
  return (
    <>
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center gap-3">
          <BrandMark logoUrl={user?.logoUrl} name={user?.organizationName ?? 'Kaya'} brandColor={user?.brandColor} size={32} />
          <span className="truncate text-[0.95rem] font-semibold text-ink">{user?.organizationName || 'Kaya'}</span>
        </div>
        <button type="button" onClick={() => { onSearch(); onNavigate?.(); }}
          className="mt-4 flex w-full items-center gap-2 rounded-control border border-line bg-sunk/60 px-3 py-2 text-left text-sm text-faint transition hover:border-ink/30 hover:bg-white">
          <Search size={15} /> <span className="flex-1">Search</span>
          <kbd className="hidden rounded border border-line bg-white px-1.5 py-px text-[0.65rem] lg:block">Ctrl K</kbd>
        </button>
        {user?.role !== 'CARETAKER' && <QuickAdd variant="sidebar" />}
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g, gi) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={gi} className={gi === 0 ? '' : 'mt-6'}>
              {g.title && <p className="mb-1.5 px-3 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-faint">{t(g.titleKey!, g.title)}</p>}
              {items.map(({ to, labelKey, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  data-nav={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative mb-0.5 flex items-center focus-visible:outline-offset-[-2px] gap-3 rounded-control py-2 pl-3 pr-3 text-[0.875rem] transition-colors ${
                      isActive ? 'bg-accent-soft font-medium text-accent-deep' : 'text-muted hover:bg-sunk hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" aria-hidden />}
                      <Icon size={16} strokeWidth={1.75} className={isActive ? 'text-accent' : 'text-faint group-hover:text-ink'} />
                      <span className="flex-1">{t(labelKey)}</span>
                      {counts[to] && (
                        <span className={`min-w-[1.35rem] rounded-full px-1.5 py-px text-center text-[0.68rem] font-semibold tabular-nums ${counts[to]!.tone === 'danger' ? 'bg-[#fbefed] text-danger' : isActive ? 'bg-white text-accent-deep' : 'bg-sunk text-muted'}`}>
                          {counts[to]!.n}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-control bg-sunk/60 px-2 py-2">
          <Avatar name={user?.name ?? '?'} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-xs text-muted">{(user?.role ?? '').replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</p>
          </div>
          <button onClick={() => logout()} className="rounded-control p-1.5 text-faint hover:bg-sunk hover:text-ink" title={t('nav.logOut')} aria-label={t('nav.logOut')}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { visible } = useVisibleItems();
  const pages: PalettePage[] = NAV_GROUPS.flatMap((g) => g.items.filter(visible)).map((i) => ({ to: i.to, label: t(i.labelKey), icon: i.icon }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching((s) => !s); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen bg-ground">
      <GuideAssistant />
      <CommandPalette open={searching} onClose={() => setSearching(false)} pages={pages} />
      {/* Desktop sidebar */}
      <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-line bg-white lg:flex">
        <SidebarContent onSearch={() => setSearching(true)} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-lift">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 rounded-control p-1.5 text-faint hover:bg-sunk" aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} onSearch={() => setSearching(true)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-control p-1.5 text-ink hover:bg-sunk">
            <Menu size={20} />
          </button>
          <BrandMark logoUrl={user?.logoUrl} name={user?.organizationName ?? 'Kaya'} brandColor={user?.brandColor} size={28} />
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{user?.organizationName || 'Kaya'}</span>
          <button onClick={() => setSearching(true)} className="rounded-control p-2 text-ink hover:bg-sunk" aria-label="Search"><Search size={19} /></button>
          {user?.role !== 'CARETAKER' && <QuickAdd variant="icon" />}
        </div>
        <main key={location.pathname} className="scrollbar-thin flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
