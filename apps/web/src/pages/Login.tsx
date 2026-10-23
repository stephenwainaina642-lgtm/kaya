import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('wanjiru@savannaridge.co.ke');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      // 403 = workspace suspended, 423 = account locked out, 429 = too many
      // attempts from this network — all three have a real, specific
      // message worth showing. Anything else (401, wrong password) stays
      // generic so a bad guess doesn't learn whether the email exists.
      const showServerMessage = err instanceof ApiError && [403, 423, 429].includes(err.status);
      setError(showServerMessage ? (err as ApiError).message : 'Invalid email or password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-control bg-cypress-600 font-display text-xl font-semibold text-white">
            K
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">Kaya</h1>
          <p className="text-sm text-muted">Sign in to your agency workspace</p>
        </div>
        <form onSubmit={onSubmit} className="rounded-panel border border-line bg-surface p-6 shadow-card">
          <label className="mb-1 block text-sm font-medium text-ink">Email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mb-4" />
          <label className="mb-1 block text-sm font-medium text-ink">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Kaya!Demo2026"
            className="mb-4"
          />
          {error && <p className="mb-4 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-faint">Demo: wanjiru@savannaridge.co.ke / Kaya!Demo2026</p>
      </div>
    </div>
  );
}
