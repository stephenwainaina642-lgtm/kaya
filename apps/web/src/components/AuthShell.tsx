import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const PIPELINE_ROWS = [
  { name: 'Kilimani · 2BR Apartment', price: 'KES 12.5M', tone: 'bg-cypress-50 text-cypress-700', stage: 'Viewing booked' },
  { name: 'Lavington · Townhouse', price: 'KES 38M', tone: 'bg-[#fbf3e7] text-brass', stage: 'Offer received' },
];

/** The floating "pipeline" card on the editorial panel — a smaller, static
 * echo of the one on the marketing landing page (PipelineMock in
 * Landing.tsx), so a visitor who clicked through from there sees the same
 * visual language carried into sign-in/sign-up rather than a jarring cut
 * to a plain form. */
function PipelineGlimpse() {
  return (
    <div className="rounded-panel border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-white/70">This week's pipeline</p>
        <span className="text-[11px] text-white/40">Savanna Ridge Realty</span>
      </div>
      <div className="space-y-2">
        {PIPELINE_ROWS.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-control bg-white/[0.06] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-white">{r.name}</p>
              <p className="text-[11px] text-white/50">{r.price}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${r.tone}`}>{r.stage}</span>
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
  eyebrow, headline, subhead, children,
}: { eyebrow: string; headline: string; subhead: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ground">
      <div className="relative hidden w-[44%] shrink-0 overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1.5px, transparent 0)', backgroundSize: '26px 26px' }}
        />
        <div
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #b08d57 0%, transparent 70%)' }}
        />

        <div className="relative z-10 px-10 pt-10 xl:px-14 xl:pt-12">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-control bg-brass font-display text-base font-semibold text-ink">K</div>
            <span className="font-display text-lg font-semibold text-white">Kaya</span>
          </Link>
        </div>

        <div className="relative z-10 px-10 xl:px-14">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-brass">{eyebrow}</p>
          <h2 className="max-w-sm font-display text-3xl font-semibold leading-tight text-white xl:text-4xl">{headline}</h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">{subhead}</p>
        </div>

        <div className="relative z-10 px-10 pb-12 pt-10 xl:px-14">
          <PipelineGlimpse />
          <p className="mt-6 text-xs text-white/35">Built for agencies across East Africa and beyond — priced and shown in your own currency.</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
