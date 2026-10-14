import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Building2, LogOut } from 'lucide-react';
import { usePlatformAuth } from './PlatformAuthContext';

const NAV = [
  { to: '/platform', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/platform/organizations', label: 'Organizations', icon: Building2 },
];

export function PlatformLayout() {
  const { admin, logout } = usePlatformAuth();

  return (
    <div className="flex h-screen bg-ground">
      <aside className="hidden w-64 shrink-0 flex-col bg-[#14201a] lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control bg-white font-display text-sm font-semibold text-[#14201a]">
            K
          </div>
          <div>
            <p className="font-display text-sm font-semibold leading-tight text-white">Kaya Platform</p>
            <p className="text-[11px] text-cypress-100/60">Operator console</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `mb-0.5 flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-white/10 text-white' : 'text-cypress-100/70 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2 rounded-control px-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{admin?.name}</p>
              <p className="truncate text-xs text-cypress-100/60">{admin?.email}</p>
            </div>
            <button onClick={logout} className="rounded-control p-1.5 text-cypress-100/60 hover:bg-white/10 hover:text-white" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-control bg-[#14201a] font-display text-xs font-semibold text-white">K</div>
            <span className="font-display text-base font-semibold text-ink">Kaya Platform</span>
          </div>
          <button onClick={logout} className="rounded-control p-1.5 text-faint hover:bg-sunk hover:text-ink">
            <LogOut size={18} />
          </button>
        </div>
        <main className="scrollbar-thin flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
