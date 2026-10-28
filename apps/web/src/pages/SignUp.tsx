import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CURRENCIES } from '@kaya/shared';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { AuthShell } from '../components/AuthShell';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function SignUp() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
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
    <AuthShell eyebrow={t('signup.eyebrow')} headline={t('signup.headline')} subhead={t('signup.subhead')}>
      <div className="mb-6 flex justify-center lg:justify-end">
        <LanguageSwitcher />
      </div>
      <div className="mb-8 flex flex-col items-center gap-3 lg:items-start">
        <div className="flex h-12 w-12 items-center justify-center rounded-control bg-cypress-600 font-display text-xl font-semibold text-white lg:hidden">
          K
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t('signup.title')}</h1>
        <p className="text-center text-sm text-muted lg:text-left">{t('signup.subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} className="rounded-panel border border-line bg-surface p-6 shadow-card">
        <label className="mb-1 block text-sm font-medium text-ink">{t('signup.agencyName')}</label>
        <Input
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          required
          placeholder="Savanna Ridge Realty"
          className="mb-4"
        />

        <label className="mb-1 block text-sm font-medium text-ink">{t('signup.yourName')}</label>
        <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} required placeholder="Jane Mwangi" className="mb-4" />

        <label className="mb-1 block text-sm font-medium text-ink">{t('signup.workEmail')}</label>
        <Input
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          required
          placeholder="jane@youragency.com"
          className="mb-4"
        />

        <label className="mb-1 block text-sm font-medium text-ink">{t('signup.password')}</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="mb-4"
        />

        <label className="mb-1 block text-sm font-medium text-ink">{t('signup.currency')}</label>
        <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mb-5">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </Select>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('signup.submitting') : t('signup.submit')}
        </Button>
        <p className="mt-4 text-center text-xs text-faint">{t('signup.planHint')}</p>
      </form>
      <p className="mt-4 text-center text-sm text-muted lg:text-left">
        {t('signup.alreadyHaveWorkspace')}{' '}
        <Link to="/login" className="font-medium text-cypress-700 hover:underline">
          {t('signup.signIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
