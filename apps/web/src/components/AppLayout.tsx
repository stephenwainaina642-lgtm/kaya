import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCircle, Building2, Landmark, CalendarClock, ListChecks,
  Handshake, Wallet, Calendar, MessageSquare, FileText, BarChart3, UsersRound, Settings, LogOut, Menu, X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from './ui/Avatar';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/clients', label: 'Clients', icon: UserCircle },
  { to: '/properties', label: 'Properties', icon: Building2 },
  { to: '/owners', label: 'Owners', icon: Landmark },
  { to: '/viewings', label: 'Viewings', icon: CalendarClock },
  { to: '/follow-ups', label: 'Follow-ups', icon: ListChecks },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/deals', label: 'Deals', icon: Handshake },
  { to: '/commissions', label: 'Commissions', icon: Wallet },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
  { to: '/communications', label: 'Communications', icon: MessageSquare },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/team', label: 'Team', icon: UsersRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  return (
    <>
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-control bg-cypress-600 font-display text-sm font-semibold text-white">
          K
        </div>
        <span className="font-display text-lg font-semibold text-ink">Kaya</span>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `mb-0.5 flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-cypress-50 text-cypress-700' : 'text-muted hover:bg-sunk hover:text-ink'
              }`
            }
          >
            <Icon size={17} strokeWidth={2} />
            {label}
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
          <button onClick={() => logout()} className="rounded-control p-1.5 text-faint hover:bg-sunk hover:text-ink" title="Log out">
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
          <div className="flex h-7 w-7 items-center justify-center rounded-control bg-cypress-600 font-display text-xs font-semibold text-white">
            K
          </div>
          <span className="font-display text-base font-semibold text-ink">Kaya</span>
        </div>
        <main key={location.pathname} className="scrollbar-thin flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
