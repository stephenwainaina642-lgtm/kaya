import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const PIPELINE_ROWS = [
  { name: 'Kilimani · 2BR Apartment', price: 'KES 12.5M', stage: 'Viewing booked' },
  { name: 'Lavington · Townhouse', price: 'KES 38M', stage: 'Offer received' },
];

/** A plain preview of the product: two pipeline lines, set like ledger rows. */
function PipelineGlimpse() {
  return (
    <div className="rounded-panel border border-line bg-white">
      <p className="border-b border-line px-5 py-3 text-xs text-muted">This week at Savanna Ridge Realty</p>
      <div className="divide-y divide-line">
        {PIPELINE_ROWS.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{r.name}</p>
              <p className="text-sm font-semibold tabular text-ink">{r.price}</p>
            </div>
            <span className="shrink-0 rounded-full bg-sunk px-2.5 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-line">{r.stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Split layout shared by sign-in, sign-up and the password screens. */
export function AuthShell({
  headline, subhead, children,
}: { eyebrow?: string; headline: string; subhead: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden w-[44%] shrink-0 flex-col justify-between border-r border-line bg-ground px-12 py-12 lg:flex xl:px-16">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control bg-ink text-sm font-semibold text-white">K</div>
          <span className="text-base font-semibold text-ink">Kaya</span>
        </Link>

        <div>
          <h2 className="max-w-md text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.02em] text-ink xl:text-[2.6rem]">{headline}</h2>
          <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-muted">{subhead}</p>
        </div>

        <div>
          <PipelineGlimpse />
          <p className="mt-5 text-xs text-faint">Built for agencies across East Africa and beyond, shown in your own currency.</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
