interface MonthDatum {
  month: string;
  value: number;
  displayValue: string;
}

/** Dependency-free SVG bar chart for a short monthly series. */
export function MonthlyBarChart({ data }: { data: MonthDatum[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 640;
  const height = 180;
  const padding = { top: 24, bottom: 28, left: 4, right: 4 };
  const chartHeight = height - padding.top - padding.bottom;
  const barGap = 10;
  const barWidth = data.length > 0 ? (width - padding.left - padding.right - barGap * (data.length - 1)) / data.length : 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Monthly commission revenue">
      {data.map((d, i) => {
        const barHeight = Math.max((d.value / max) * chartHeight, d.value > 0 ? 3 : 0);
        const x = padding.left + i * (barWidth + barGap);
        const y = padding.top + (chartHeight - barHeight);
        return (
          <g key={d.month}>
            <rect
              x={x} y={y} width={barWidth} height={barHeight} rx={4}
              className="fill-cypress-600"
            />
            <text
              x={x + barWidth / 2} y={y - 6}
              textAnchor="middle"
              className="fill-ink text-[10px] font-medium"
              style={{ fontSize: 10 }}
            >
              {d.displayValue}
            </text>
            <text
              x={x + barWidth / 2} y={height - 8}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 10 }}
            >
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
