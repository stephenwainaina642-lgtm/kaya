import { useState } from 'react';
import { CalendarClock, CheckSquare, Plus, UserCircle, Users, type LucideIcon } from 'lucide-react';
import { can, type Permission } from '@kaya/shared';
import { useAuth } from '../auth/AuthContext';
import { Modal } from './ui/Modal';
import { NewLeadForm } from '../forms/NewLeadForm';
import { NewClientForm } from '../forms/NewClientForm';
import { NewTaskForm } from '../forms/NewTaskForm';
import { NewViewingForm } from '../forms/NewViewingForm';

type Kind = 'lead' | 'client' | 'task' | 'viewing';
const ITEMS: { kind: Kind; label: string; icon: LucideIcon; permission: Permission }[] = [
  { kind: 'lead', label: 'New lead', icon: Users, permission: 'leads:create' },
  { kind: 'client', label: 'New client', icon: UserCircle, permission: 'clients:create' },
  { kind: 'viewing', label: 'Schedule viewing', icon: CalendarClock, permission: 'viewings:create' },
  { kind: 'task', label: 'New task', icon: CheckSquare, permission: 'tasks:create' },
];

/** A "+" menu available on every screen, so common records are one tap away. */
export function QuickAdd({ variant }: { variant: 'sidebar' | 'icon' }) {
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const items = ITEMS.filter((i) => user && can(user.role, i.permission));
  if (!items.length) return null;
  const done = () => setKind(null);
  return (
    <div className="relative">
      {variant === 'sidebar' ? (
        <button type="button" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-control bg-ink px-3 py-2 text-sm font-medium text-white transition hover:bg-ink/90">
          <Plus size={15} /> Quick add
        </button>
      ) : (
        <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Quick add" aria-haspopup="menu" aria-expanded={menu}
          className="rounded-control p-2 text-ink hover:bg-sunk"><Plus size={20} /></button>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <ul role="menu" className={`absolute z-50 w-48 overflow-hidden rounded-panel border border-line bg-white py-1 shadow-lift ${variant === 'icon' ? 'right-0 top-full mt-1' : 'left-0 top-full mt-1'}`}>
            {items.map(({ kind: k, label, icon: Icon }) => (
              <li key={k} role="none">
                <button role="menuitem" type="button" onClick={() => { setMenu(false); setKind(k); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-sunk">
                  <Icon size={15} className="text-muted" /> {label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Modal open={kind === 'lead'} onClose={done} title="New lead"><NewLeadForm onDone={done} /></Modal>
      <Modal open={kind === 'client'} onClose={done} title="New client"><NewClientForm onDone={done} /></Modal>
      <Modal open={kind === 'viewing'} onClose={done} title="New viewing"><NewViewingForm onDone={done} /></Modal>
      <Modal open={kind === 'task'} onClose={done} title="New task"><NewTaskForm onDone={done} /></Modal>
    </div>
  );
}
