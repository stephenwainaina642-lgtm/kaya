import { Badge } from './ui/Badge';

const TONE: Record<string, 'ok' | 'accent' | 'warn' | 'neutral'> = {
  EXCELLENT: 'ok',
  GOOD: 'accent',
  FAIR: 'warn',
  POOR: 'neutral',
};

export function MatchVerdictBadge({ verdict, score }: { verdict: string; score: number }) {
  return <Badge tone={TONE[verdict] ?? 'neutral'}>{verdict} · {score}</Badge>;
}
