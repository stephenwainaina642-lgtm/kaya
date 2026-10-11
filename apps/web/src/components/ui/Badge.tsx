import type { ReactNode } from 'react';

const TONES = {
  neutral: 'bg-ground text-muted',
  ok: 'bg-cypress-50 text-cypress-700',
  warn: 'bg-amber-50 text-warn',
  danger: 'bg-red-50 text-danger',
  accent: 'bg-[#fbf3e7] text-brass',
} as const;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
