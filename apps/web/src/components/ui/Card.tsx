import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-panel border border-line bg-surface shadow-card ${className}`} {...props} />;
}
