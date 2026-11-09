export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`} role="status" aria-label="Loading">
      <div className="h-5 w-5 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />
    </div>
  );
}
