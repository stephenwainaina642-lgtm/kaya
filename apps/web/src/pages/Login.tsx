import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthShell } from '../components/AuthShell';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
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
    <AuthShell eyebrow={t('login.eyebrow')} headline={t('login.headline')} subhead={t('login.subhead')}>
      <div className="mb-6 flex justify-center lg:justify-end">
        <LanguageSwitcher />
      </div>
      <div className="mb-8 flex flex-col items-center gap-3 lg:items-start">
        <div className="flex h-12 w-12 items-center justify-center rounded-control bg-cypress-600 font-display text-xl font-semibold text-white lg:hidden">
          K
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('login.welcomeBack')}</h1>
        <p className="text-sm text-muted">{t('login.signInSubtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="rounded-panel border border-line bg-surface p-6 shadow-card">
        <label className="mb-1 block text-sm font-medium text-ink">{t('login.email')}</label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mb-4" />
        <label className="mb-1 block text-sm font-medium text-ink">{t('login.password')}</label>
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
          {busy ? t('login.signingIn') : t('login.signIn')}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-faint lg:text-left">{t('login.demoHint')}</p>
      <p className="mt-4 text-center text-sm text-muted lg:text-left">
        {t('login.newToKaya')}{' '}
        <Link to="/signup" className="font-medium text-cypress-700 hover:underline">
          {t('login.createWorkspace')}
        </Link>
      </p>
    </AuthShell>
  );
}
