import { money } from '../../lib/currency';

export interface TrendBar { label: string; a: number; b: number }

/**
 * Paired monthly bars: what was due (pale) against what was received (solid). Plain SVG so it prints,
 * scales to any width and needs no library. Each bar carries a title for hover and screen readers.
 */
export function PairedBars({ data, aLabel, bLabel, height = 168 }: { data: TrendBar[]; aLabel: string; bLabel: string; height?: number }) {
  const W = 600;
  const pad = { l: 4, r: 4, t: 10, b: 30 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length);
  const bw = Math.min(30, slot * 0.3);
  const h = (v: number) => ((height - pad.t - pad.b) * v) / max;
  const base = height - pad.b;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label={`${aLabel} and ${bLabel} by month`}>
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} stroke="#e3e7ec" />
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={d.label + i}>
              <rect x={cx - bw - 1} y={base - h(d.a)} width={bw} height={Math.max(d.a ? 2 : 0, h(d.a))} rx={2} fill="#dfe4ee"><title>{`${d.label} · ${aLabel}: ${money(d.a)}`}</title></rect>
              <rect x={cx + 1} y={base - h(d.b)} width={bw} height={Math.max(d.b ? 2 : 0, h(d.b))} rx={2} fill="#0f1419"><title>{`${d.label} · ${bLabel}: ${money(d.b)}`}</title></rect>
              <text x={cx} y={height - 9} textAnchor="middle" fontSize="15" fill="#6b7480">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-[#dfe4ee]" />{aLabel}</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-ink" />{bLabel}</span>
      </figcaption>
    </figure>
  );
}

/** A single proportion as a ring (occupancy, collection rate). */
export function Ring({ value, size = 76, label }: { value: number; size?: number; label: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3e7ec" strokeWidth={7} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0f1419" strokeWidth={7} strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.24} fontWeight={600} fill="#0f1419">{Math.round(v * 100)}%</text>
    </svg>
  );
}

export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-panel border border-line bg-white p-4">
      <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 font-display text-xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
