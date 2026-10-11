import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCircle, Building2, Landmark, CalendarClock, ListChecks,
  Handshake, Wallet, Calendar, MessageSquare, FileText, BarChart3, UsersRound, Settings, LogOut,
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

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-ground">
      <aside className="flex w-64 flex-col border-r border-line bg-surface">
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
      </aside>
      <main className="scrollbar-thin flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
