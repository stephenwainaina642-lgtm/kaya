import type { ReactNode } from 'react';

const TONES = {
  neutral: 'bg-sunk text-muted ring-line',
  ok: 'bg-accent-soft text-accent-deep ring-[#d3defa]',
  warn: 'bg-[#fdf5e6] text-warn ring-[#f1dcae]',
  danger: 'bg-[#fbefed] text-danger ring-[#f0d3cf]',
  accent: 'bg-accent-soft text-accent-deep ring-[#d3defa]',
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
