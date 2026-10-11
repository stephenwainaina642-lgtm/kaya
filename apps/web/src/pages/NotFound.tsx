import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="font-display text-2xl font-semibold text-ink">Page not found</p>
      <Link to="/" className="text-sm text-cypress-700 hover:underline">Back to dashboard</Link>
    </div>
  );
}
