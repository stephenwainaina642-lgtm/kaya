import { Bath, BedDouble, Ruler } from 'lucide-react';

type Tone = 'let' | 'vacant' | 'other';

/** A drawn picture of the unit, so no photo is needed. Colour follows occupancy; a wrench badge flags open repairs. */
export function UnitGraphic({ label, building, status, bedrooms, bathrooms, sizeSqm, tenant, issues }: {
  label: string; building?: string | null; status: string; bedrooms?: number | null; bathrooms?: number | null; sizeSqm?: number | null; tenant?: string | null; issues: number;
}) {
  const tone: Tone = tenant || status === 'LET' ? 'let' : status === 'AVAILABLE' ? 'vacant' : 'other';
  const wall = { let: '#16202b', vacant: '#edf5f0', other: '#eef0f3' }[tone];
  const ink = tone === 'let' ? '#ffffff' : '#16202b';
  const accent = tone === 'let' ? '#6f93ff' : tone === 'vacant' ? '#2f7a55' : '#7b8794';
  const text = tone === 'let' ? (tenant ? `Let to ${tenant}` : 'Let') : tone === 'vacant' ? 'Vacant, ready to let' : status.toLowerCase();
  const initials = tenant ? tenant.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') : '';
  return (
    <div className="relative overflow-hidden" style={{ background: wall }}>
      <svg viewBox="0 0 600 220" className="block h-44 w-full sm:h-56" role="img" aria-label={`Unit ${label}, ${text}`} preserveAspectRatio="xMidYMid slice">
        <g opacity="0.14" stroke={accent} strokeWidth="1.5" fill="none">
          {[0, 1, 2, 3].map((i) => <rect key={i} x={20 + i * 150} y={40} width={120} height={150} rx={4} />)}
          {[0, 1, 2, 3].map((i) => <line key={`l${i}`} x1={20 + i * 150} y1={115} x2={140 + i * 150} y2={115} />)}
        </g>
        <g fill={accent} opacity="0.9">
          <rect x="40" y="150" width="60" height="40" rx="3" />
          <rect x="190" y="60" width="30" height="40" rx="3" />
          <rect x="340" y="60" width="30" height="40" rx="3" />
          <rect x="490" y="150" width="60" height="40" rx="3" opacity="0.5" />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6" style={{ color: ink }}>
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.12em] opacity-70">{building ?? 'Unit'}</p>
            <p className="text-3xl font-semibold leading-tight tabular-nums sm:text-4xl">{label}</p>
            <p className="mt-1 truncate text-sm opacity-90">{text}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs opacity-90">
              {bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={14} /> {bedrooms} bed</span>}
              {bathrooms != null && <span className="flex items-center gap-1"><Bath size={14} /> {bathrooms} bath</span>}
              {sizeSqm != null && <span className="flex items-center gap-1"><Ruler size={14} /> {sizeSqm} m²</span>}
            </div>
          </div>
          {initials && <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-lg font-semibold ring-2 ring-white/30">{initials}</span>}
        </div>
      </div>
      {issues > 0 && (
        <span className="absolute right-4 top-4 rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white shadow-card">
          {issues} open {issues === 1 ? 'issue' : 'issues'}
        </span>
      )}
    </div>
  );
}
