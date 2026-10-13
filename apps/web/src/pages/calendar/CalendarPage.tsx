import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarPage as CalendarPageT, ScheduleItem } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const TYPE_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  VIEWING: 'accent', FOLLOW_UP: 'warn', TASK: 'neutral', DEAL_DEADLINE: 'danger',
};

const DOT_TONE: Record<string, string> = {
  VIEWING: 'bg-cypress-600', FOLLOW_UP: 'bg-brass', TASK: 'bg-faint', DEAL_DEADLINE: 'bg-danger',
};

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

/** Monday-first 6-week grid covering the full month plus leading/trailing days. */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = startOfMonth(year, month);
  const firstWeekday = (first.getUTCDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - firstWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    days.push(d);
  }
  return days;
}

export function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth());
  const [selectedKey, setSelectedKey] = useState(dateKey(today));

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const from = grid[0]!;
  const to = useMemo(() => {
    const d = new Date(grid[grid.length - 1]!);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }, [grid]);

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', from.toISOString(), to.toISOString()],
    queryFn: () =>
      api.get<CalendarPageT>('/calendar', { from: from.toISOString(), to: to.toISOString() }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const item of data?.items ?? []) {
      const key = dateKey(new Date(item.at));
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return map;
  }, [data]);

  function goToday() {
    setYear(today.getUTCFullYear());
    setMonth(today.getUTCMonth());
    setSelectedKey(dateKey(today));
  }

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-KE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const todayKey = dateKey(today);
  const selectedItems = (byDay.get(selectedKey) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const selectedLabel = new Date(`${selectedKey}T00:00:00Z`).toLocaleDateString('en-KE', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Viewings, follow-ups, tasks and deal deadlines"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></Button>
            <Button variant="secondary" onClick={goToday}>Today</Button>
            <Button variant="secondary" onClick={() => shiftMonth(1)}><ChevronRight size={16} /></Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-6 p-8 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">{monthLabel}</h2>
          {isLoading ? (
            <Spinner />
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide text-faint">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {grid.map((d) => {
                  const key = dateKey(d);
                  const items = byDay.get(key) ?? [];
                  const inMonth = d.getUTCMonth() === month;
                  const isToday = key === todayKey;
                  const isSelected = key === selectedKey;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedKey(key)}
                      className={`flex h-20 flex-col items-start gap-1 rounded-control border p-1.5 text-left transition ${
                        isSelected ? 'border-cypress-600 bg-cypress-50' : 'border-line hover:bg-sunk'
                      } ${!inMonth ? 'opacity-40' : ''}`}
                    >
                      <span className={`text-xs ${isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-cypress-600 font-semibold text-white' : 'text-muted'}`}>
                        {d.getUTCDate()}
                      </span>
                      <div className="flex flex-wrap gap-0.5">
                        {items.slice(0, 4).map((item) => (
                          <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${DOT_TONE[item.type] ?? 'bg-faint'}`} />
                        ))}
                        {items.length > 4 && <span className="text-[10px] text-faint">+{items.length - 4}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">{selectedLabel}</h2>
          {selectedItems.length === 0 ? (
            <EmptyState title="Nothing scheduled" />
          ) : (
            <ul className="divide-y divide-line">
              {selectedItems.map((item) => (
                <li key={item.id} className="py-3">
                  <Link to={item.link} className="block hover:opacity-80">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{item.title}</span>
                      <Badge tone={TYPE_TONE[item.type] ?? 'neutral'}>{item.type.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span>{new Date(item.at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span>
                      {item.subtitle && <span>· {item.subtitle}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
