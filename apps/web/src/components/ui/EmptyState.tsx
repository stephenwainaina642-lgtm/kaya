import type { ReactNode } from 'react';

export function EmptyState({ icon, title, body }: { icon?: ReactNode; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-sunk text-faint">{icon}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {body && <p className="max-w-sm text-sm leading-relaxed text-muted">{body}</p>}
    </div>
  );
}
