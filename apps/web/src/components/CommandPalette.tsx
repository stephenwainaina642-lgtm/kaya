import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, CornerDownLeft, Landmark, Search, UserCircle, Users, type LucideIcon } from 'lucide-react';
import type { SearchResults } from '@kaya/shared';
import { api } from '../lib/api';

export interface PalettePage { to: string; label: string; icon: LucideIcon }
type Row = { key: string; to: string; title: string; subtitle?: string; icon: PalettePage['icon']; group: string };

const TYPE_ICON = { lead: Users, client: UserCircle, property: Building2, owner: Landmark } as const;
const TYPE_LABEL = { lead: 'Leads', client: 'Clients', property: 'Properties', owner: 'Owners' } as const;

/** Jump to any screen or find a person or property by name or phone. Opens with Ctrl/⌘ K. */
export function CommandPalette({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: PalettePage[] }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(''); setDebounced(''); setActive(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 180); return () => clearTimeout(t); }, [q]);

  const search = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResults>('/search', { q: debounced }),
    enabled: open && debounced.length >= 2,
    staleTime: 15_000,
  });

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const matchPages = (needle ? pages.filter((p) => p.label.toLowerCase().includes(needle)) : pages.slice(0, 8))
      .map((p) => ({ key: `p:${p.to}`, to: p.to, title: p.label, icon: p.icon, group: 'Go to' }));
    const hits = debounced.length >= 2 ? (search.data?.hits ?? []).map((h) => ({
      key: `${h.type}:${h.id}`, to: h.to, title: h.title, subtitle: h.subtitle, icon: TYPE_ICON[h.type], group: TYPE_LABEL[h.type],
    })) : [];
    return [...matchPages, ...hits];
  }, [q, debounced, pages, search.data]);

  useEffect(() => { setActive(0); }, [rows.length, debounced]);
  if (!open) return null;

  const go = (r: Row | undefined) => { if (!r) return; onClose(); nav(r.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(rows[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search Kaya" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-panel border border-line bg-white shadow-lift">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="text-faint" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, properties, or jump to a screen…"
            aria-label="Search" className="w-full bg-transparent py-4 text-[0.95rem] text-ink outline-none placeholder:text-faint" />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[0.65rem] text-faint sm:block">Esc</kbd>
        </div>
        <ul className="scrollbar-thin max-h-[52vh] overflow-y-auto py-2" role="listbox">
          {rows.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{search.isFetching ? 'Searching…' : 'Nothing found. Try a name, phone number or reference.'}</li>}
          {rows.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            const Icon = r.icon;
            return (
              <li key={r.key} role="option" aria-selected={i === active}>
                {header && <p className="px-4 pb-1 pt-3 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-faint">{header}</p>}
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-accent-soft' : ''}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${i === active ? 'bg-white text-accent' : 'bg-sunk text-muted'}`}><Icon size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                    {r.subtitle && <span className="block truncate text-xs text-muted">{r.subtitle}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="shrink-0 text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-line bg-sunk px-4 py-2 text-[0.7rem] text-faint">
          <span>↑↓ to move</span><span>Enter to open</span><span className="ml-auto">Ctrl K anywhere</span>
        </div>
      </div>
    </div>
  );
}
