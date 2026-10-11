import { useQuery } from '@tanstack/react-query';
import type { CalendarPage as CalendarPageT, ScheduleItem } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const TYPE_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  VIEWING: 'accent', FOLLOW_UP: 'warn', TASK: 'neutral', DEAL_DEADLINE: 'danger',
};

export function CalendarPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['calendar'],
    queryFn: () => api.get<CalendarPageT>('/calendar'),
  });

  const grouped = new Map<string, ScheduleItem[]>();
  if (data) {
    for (const item of data.items) {
      const key = new Date(item.at).toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' });
      const arr = grouped.get(key) ?? [];
      arr.push(item);
      grouped.set(key, arr);
    }
  }

  return (
    <>
      <PageHeader title="Calendar" subtitle="Viewings, follow-ups, tasks and deal deadlines" />
      <div className="p-8">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState title="Nothing scheduled" /></Card>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([day, items]) => (
              <Card key={day} className="p-5">
                <h3 className="mb-3 font-display text-base font-semibold text-ink">{day}</h3>
                <ul className="divide-y divide-line">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-14 shrink-0 text-xs text-muted">
                        {new Date(item.at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="flex-1 text-ink">{item.title}</span>
                      <Badge tone={TYPE_TONE[item.type] ?? 'neutral'}>{item.type.replace(/_/g, ' ')}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
