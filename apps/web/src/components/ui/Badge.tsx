import type { ReactNode } from 'react';

const TONES = {
  neutral: 'bg-sunk text-muted ring-line',
  ok: 'bg-[#edf5f0] text-ok ring-[#cfe3d8]',
  warn: 'bg-brass-soft text-brass-deep ring-[#ead9b8]',
  danger: 'bg-[#fbefed] text-danger ring-[#f0d3cf]',
  accent: 'bg-brass-soft text-brass-deep ring-[#ead9b8]',
} as const;

// Statuses arrive from the API as SHOUTY_ENUMS; show them as plain sentence case.
function soften(node: ReactNode): ReactNode {
  if (typeof node !== 'string' || node.length < 2 || node !== node.toUpperCase() || !/[A-Z]/.test(node)) return node;
  const t = node.replace(/_/g, ' ').toLowerCase();
  return t[0]!.toUpperCase() + t.slice(1);
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {soften(children)}
    </span>
  );
}
