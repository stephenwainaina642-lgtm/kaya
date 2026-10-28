import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, UserCircle, Building2, Landmark, CalendarClock, ListChecks,
  Handshake, Wallet, Calendar, MessageSquare, FileText, BarChart3, UsersRound, Settings, LogOut, Menu, X, ShieldCheck, LineChart, Workflow,
} from 'lucide-react';
import { planHasModule } from '@kaya/shared';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from './ui/Avatar';
import { BrandMark } from './BrandMark';

const NAV = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', labelKey: 'nav.leads', icon: Users },
  { to: '/clients', labelKey: 'nav.clients', icon: UserCircle },
  { to: '/properties', labelKey: 'nav.properties', icon: Building2 },
  { to: '/owners', labelKey: 'nav.owners', icon: Landmark },
  { to: '/viewings', labelKey: 'nav.viewings', icon: CalendarClock },
  { to: '/follow-ups', labelKey: 'nav.followUps', icon: ListChecks },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/deals', labelKey: 'nav.deals', icon: Handshake, module: 'dealsPipeline' as const },
  { to: '/commissions', labelKey: 'nav.commissions', icon: Wallet, module: 'dealsPipeline' as const },
  { to: '/calendar', labelKey: 'nav.calendar', icon: Calendar },
  { to: '/communications', labelKey: 'nav.communications', icon: MessageSquare },
  { to: '/documents', labelKey: 'nav.documents', icon: FileText },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart3 },
  { to: '/analytics', labelKey: 'nav.analytics', icon: LineChart, module: 'analytics' as const },
  { to: '/automation', labelKey: 'nav.automation', icon: Workflow, module: 'automation' as const },
  { to: '/audit-log', labelKey: 'nav.auditLog', icon: ShieldCheck, module: 'auditLog' as const },
  { to: '/team', labelKey: 'nav.team', icon: UsersRound },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const items = NAV.filter((item) => !item.module || !user || planHasModule(user.plan, item.module));
  return (
    <>
      <div className="flex items-center gap-2 px-5 py-5">
        <BrandMark logoUrl={user?.logoUrl} name={user?.organizationName ?? 'Kaya'} brandColor={user?.brandColor} size={32} />
        <span className="truncate font-display text-lg font-semibold text-ink">{user?.organizationName || 'Kaya'}</span>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        {items.map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `mb-0.5 flex items-center gap-2.5 rounded-control border-l-[3px] py-2 pl-2.5 pr-3 text-sm font-medium transition-colors ${
                isActive ? 'border-l-cypress-600 bg-cypress-50 text-cypress-700' : 'border-l-transparent text-muted hover:bg-sunk hover:text-ink'
              }`
            }
          >
            <Icon size={17} strokeWidth={2} />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2 rounded-control px-2 py-2">
          <Avatar name={user?.name ?? '?'} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.role.replace('_', ' ')}</p>
          </div>
          <button onClick={() => logout()} className="rounded-control p-1.5 text-faint hover:bg-sunk hover:text-ink" title={t('nav.logOut')}>
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
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-control p-1.5 text-faint hover:bg-sunk"
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
          <span className="truncate font-display text-base font-semibold text-ink">{user?.organizationName || 'Kaya'}</span>
        </div>
        <main key={location.pathname} className="scrollbar-thin flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
