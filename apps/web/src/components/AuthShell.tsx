import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const PIPELINE_ROWS = [
  { name: 'Kilimani · 2BR Apartment', price: 'KES 12.5M', tone: 'bg-white/10 text-white/80', stage: 'Viewing booked' },
  { name: 'Lavington · Townhouse', price: 'KES 38M', tone: 'bg-brass/20 text-[#e3c796]', stage: 'Offer received' },
];

/** A quiet glimpse of the product: two live-looking pipeline lines, set like ledger rows. */
function PipelineGlimpse() {
  return (
    <div className="rounded-panel border border-white/10 bg-white/[0.03] px-5 py-4">
      <p className="mb-3 text-xs text-white/45">This week · Savanna Ridge Realty</p>
      <div className="divide-y divide-white/10">
        {PIPELINE_ROWS.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm text-white/90">{r.name}</p>
              <p className="font-display text-lg leading-tight text-brass">{r.price}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${r.tone}`}>{r.stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Shared editorial split-screen for the two unauthenticated entry points
 * (Login, SignUp) — a dark panel carrying the brand and a reason to
 * trust the product on the left, the actual form on the right. Collapses
 * to just the form on small screens, where a side panel would only push
 * the thing people came to do below the fold.
 */
export function AuthShell({
  headline, subhead, children,
}: { eyebrow?: string; headline: string; subhead: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ground">
      <div className="relative hidden w-[46%] shrink-0 overflow-hidden bg-spine lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 0% 0%, #17332a 0%, rgba(12,26,22,0) 60%), radial-gradient(70% 50% at 100% 100%, rgba(182,146,90,0.10) 0%, rgba(12,26,22,0) 70%)' }} />
        <div className="relative z-10 px-10 pt-11 xl:px-16 xl:pt-14">
          <Link to="/" className="inline-flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-control bg-cypress-600 font-display text-xl leading-none text-spine-bright ring-1 ring-inset ring-white/20">K</div>
            <span className="font-display text-2xl text-spine-bright">Kaya</span>
          </Link>
          <span className="mt-6 block h-px w-10 bg-brass" />
        </div>

        <div className="relative z-10 px-10 xl:px-16">
          <h2 className="max-w-md font-display text-[2.9rem] leading-[1.06] text-spine-bright xl:text-[3.4rem]">{headline}</h2>
          <p className="mt-5 max-w-sm text-[0.95rem] leading-relaxed text-white/55">{subhead}</p>
        </div>

        <div className="relative z-10 px-10 pb-12 pt-10 xl:px-16">
          <PipelineGlimpse />
          <p className="mt-6 text-xs text-white/35">Built for agencies across East Africa and beyond, shown in your own currency.</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
