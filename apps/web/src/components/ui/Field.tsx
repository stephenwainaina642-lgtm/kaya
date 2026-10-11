import type { ReactNode } from 'react';

export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
