import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-8 pb-2 pt-9">
      <div className="min-w-0">
        <h1 className="text-display text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-xl text-[0.9375rem] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
