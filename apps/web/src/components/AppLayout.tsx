import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, UserCircle, Building2, Landmark, CalendarClock, ListChecks,
  Handshake, Wallet, Calendar, MessageSquare, FileText, BarChart3, UsersRound, Settings, LogOut, Menu, X, ShieldCheck, LineChart, Workflow, KeyRound, Wrench,
} from 'lucide-react';
import { can, planHasModule, type Permission } from '@kaya/shared';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from './ui/Avatar';
import { BrandMark } from './BrandMark';

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard; end?: boolean; module?: 'dealsPipeline' | 'rentManagement' | 'analytics' | 'automation' | 'auditLog'; permission?: Permission };

// Grouped so a 20-item list reads as three short ones. Titles are quiet, sentence case.
const NAV_GROUPS: { titleKey?: string; title?: string; items: NavItem[] }[] = [
  { items: [{ to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true }] },
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const visible = (item: NavItem) =>
    (!item.module || !user || planHasModule(user.plan, item.module)) && (!item.permission || !user || can(user.role, item.permission));
  return (
    <>
      <div className="px-5 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <BrandMark logoUrl={user?.logoUrl} name={user?.organizationName ?? 'Kaya'} brandColor={user?.brandColor} size={34} />
          <span className="truncate font-display text-[1.35rem] leading-none text-spine-bright">{user?.organizationName || 'Kaya'}</span>
        </div>
        <span className="mt-5 block h-px w-8 bg-brass" />
      </div>
      <nav className="spine-scroll flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g, gi) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={gi} className={gi === 0 ? '' : 'mt-6'}>
              {g.title && <p className="mb-1.5 px-3 text-xs font-medium text-spine-text/55">{t(g.titleKey!, g.title)}</p>}
              {items.map(({ to, labelKey, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative mb-px flex items-center gap-3 rounded-control py-[7px] pl-3 pr-3 text-[0.875rem] transition-colors ${
                      isActive ? 'bg-white/[0.07] font-medium text-spine-bright' : 'text-spine-text hover:bg-white/[0.04] hover:text-spine-bright'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-brass" />}
                      <Icon size={16} strokeWidth={1.75} className={isActive ? 'text-brass' : 'text-spine-text/70 group-hover:text-spine-bright'} />
                      {t(labelKey)}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-spine-line p-3">
        <div className="flex items-center gap-2.5 rounded-control px-2 py-2">
          <Avatar name={user?.name ?? '?'} size={32} onDark />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-spine-bright">{user?.name}</p>
            <p className="truncate text-xs text-spine-text/70">{(user?.role ?? '').replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</p>
          </div>
          <button onClick={() => logout()} className="rounded-control p-1.5 text-spine-text/60 hover:bg-white/[0.06] hover:text-spine-bright" title={t('nav.logOut')} aria-label={t('nav.logOut')}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-ground">
      {/* Desktop sidebar */}
      <aside className="hidden w-[15.5rem] shrink-0 flex-col bg-spine lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-spine/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-spine shadow-lift">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 rounded-control p-1.5 text-spine-text hover:bg-white/[0.06]" aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-control p-1.5 text-ink hover:bg-sunk">
            <Menu size={20} />
          </button>
          <BrandMark logoUrl={user?.logoUrl} name={user?.organizationName ?? 'Kaya'} brandColor={user?.brandColor} size={28} />
          <span className="truncate font-display text-xl text-ink">{user?.organizationName || 'Kaya'}</span>
        </div>
        <main key={location.pathname} className="scrollbar-thin flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
