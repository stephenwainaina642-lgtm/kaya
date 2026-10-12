interface BarDatum {
  label: string;
  value: number;
  displayValue?: string;
}

export function HorizontalBars({ data, tone = 'cypress' }: { data: BarDatum[]; tone?: 'cypress' | 'brass' }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barColor = tone === 'brass' ? 'bg-brass' : 'bg-cypress-600';

  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted">{d.label}</span>
            <span className="font-medium text-ink">{d.displayValue ?? d.value}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ground">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
