import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CURRENCIES } from '@kaya/shared';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

export function SignUp() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ organizationName, adminName, adminEmail, password, currency });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong creating your workspace. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-control bg-cypress-600 font-display text-xl font-semibold text-white">
            K
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">Create your agency workspace</h1>
          <p className="text-center text-sm text-muted">
            Set up Kaya for your agency in under a minute — no sales call required.
          </p>
        </div>
        <form onSubmit={onSubmit} className="rounded-panel border border-line bg-surface p-6 shadow-card">
          <label className="mb-1 block text-sm font-medium text-ink">Agency name</label>
          <Input
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            required
            placeholder="Savanna Ridge Realty"
            className="mb-4"
          />

          <label className="mb-1 block text-sm font-medium text-ink">Your name</label>
          <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} required placeholder="Jane Mwangi" className="mb-4" />

          <label className="mb-1 block text-sm font-medium text-ink">Work email</label>
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
            placeholder="jane@youragency.com"
            className="mb-4"
          />

          <label className="mb-1 block text-sm font-medium text-ink">Password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="mb-4"
          />

          <label className="mb-1 block text-sm font-medium text-ink">Currency</label>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mb-5">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </Select>

          {error && <p className="mb-4 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating your workspace…' : 'Create workspace'}
          </Button>
          <p className="mt-4 text-center text-xs text-faint">
            You start on the Starter plan, free to try — upgrade any time from Settings.
          </p>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have a workspace?{' '}
          <Link to="/login" className="font-medium text-cypress-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
