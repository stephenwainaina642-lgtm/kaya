interface FunnelDatum {
  label: string;
  count: number;
}

/** Dependency-free SVG funnel: each stage's bar width is relative to the first stage, with a conversion % to the stage before it. */
export function FunnelChart({ data }: { data: FunnelDatum[] }) {
  const first = data[0]?.count ?? 0;
  const max = Math.max(first, 1);

  return (
    <div className="space-y-4">
      {data.map((d, i) => {
        const widthPct = Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0);
        const prev = i > 0 ? data[i - 1]!.count : null;
        const stepRate = prev && prev > 0 ? (d.count / prev) * 100 : null;
        return (
          <div key={d.label}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-muted">{d.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-lg font-semibold text-ink">{d.count}</span>
                {stepRate !== null && <span className="text-xs text-faint">{stepRate.toFixed(0)}% of previous</span>}
              </span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-control bg-ground">
              <div
                className="h-full rounded-control bg-cypress-600 transition-all"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
