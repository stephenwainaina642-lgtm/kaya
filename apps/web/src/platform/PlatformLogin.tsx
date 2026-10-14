import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { usePlatformAuth } from './PlatformAuthContext';
import { ApiError } from './api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function PlatformLogin() {
  const { admin, login } = usePlatformAuth();
  const [email, setEmail] = useState('ops@kaya.co.ke');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (admin) return <Navigate to="/platform" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid email or password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#14201a] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-control bg-white font-display text-xl font-semibold text-[#14201a]">
            K
          </div>
          <h1 className="font-display text-2xl font-semibold text-white">Kaya Platform</h1>
          <p className="text-sm text-cypress-100">Operator console — not an agency workspace</p>
        </div>
        <form onSubmit={onSubmit} className="rounded-panel border border-white/10 bg-white/5 p-6 backdrop-blur">
          <label className="mb-1 block text-sm font-medium text-white">Email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mb-4" />
          <label className="mb-1 block text-sm font-medium text-white">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Kaya!Demo2026"
            className="mb-4"
          />
          {error && <p className="mb-4 text-sm text-[#ff9b8a]">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-cypress-100/60">Demo: ops@kaya.co.ke / Kaya!Demo2026</p>
      </div>
    </div>
  );
}
