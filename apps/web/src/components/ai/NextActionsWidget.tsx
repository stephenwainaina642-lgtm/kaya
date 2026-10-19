import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';

interface NextAction {
  title: string;
  reasoning: string;
  link: string;
}

/** Renders nothing when AI isn't on the plan or isn't configured — this is a bonus
 * widget layered on top of the dashboard's own "Needs attention" list, not a required
 * feature, so a 403/503 here should quietly disappear rather than show an error card. */
export function NextActionsWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-next-actions'],
    queryFn: () => api.get<{ actions: NextAction[] }>('/ai/next-actions'),
    retry: false,
  });

  if (isError || (data && data.actions.length === 0)) return null;

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Sparkles size={18} className="text-brass" /> AI-suggested next steps
      </h2>
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <ul className="space-y-3">
          {data.actions.map((action, i) => (
            <li key={i}>
              <Link to={action.link} className="text-sm font-medium text-ink hover:text-cypress-700">{action.title}</Link>
              <p className="text-xs text-muted">{action.reasoning}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
