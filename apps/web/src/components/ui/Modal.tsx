import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open, onClose, title, children, width = 'max-w-lg',
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-16 sm:pt-24" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${width} rounded-panel border border-line bg-surface shadow-lift`}>
        <div className="flex items-center justify-between px-6 pb-3 pt-5">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-control p-1.5 text-faint hover:bg-sunk hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="mx-6 h-px bg-line" />
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
