import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthShell } from '../components/AuthShell';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('reset.mismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      const fields = err instanceof ApiError ? err.details : undefined;
      setError(fields?.token ?? fields?.newPassword ?? (err instanceof ApiError ? err.message : t('forgot.error')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow={t('forgot.eyebrow')} headline={t('forgot.headline')} subhead={t('forgot.subhead')}>
      <div className="mb-6 flex justify-center lg:justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="mb-2 font-display text-2xl font-semibold text-ink">{t('reset.title')}</h1>
      <p className="mb-8 text-sm text-muted">{t('reset.subtitle')}</p>
      {done ? (
        <div className="rounded-panel border border-line bg-surface p-6 shadow-card">
          <p className="mb-4 text-sm text-ink">{t('reset.done')}</p>
          <Link to="/login" className="font-medium text-cypress-700 hover:underline">{t('forgot.backToSignIn')}</Link>
        </div>
      ) : !token ? (
        <div className="rounded-panel border border-line bg-surface p-6 shadow-card">
          <p className="mb-4 text-sm text-danger">{t('reset.missingToken')}</p>
          <Link to="/forgot-password" className="font-medium text-cypress-700 hover:underline">{t('reset.requestNew')}</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="rounded-panel border border-line bg-surface p-6 shadow-card">
          <label className="mb-1 block text-sm font-medium text-ink">{t('reset.newPassword')}</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="mb-4" />
          <label className="mb-1 block text-sm font-medium text-ink">{t('reset.confirm')}</label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className="mb-4" />
          {error && <p className="mb-4 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? t('reset.saving') : t('reset.submit')}</Button>
        </form>
      )}
    </AuthShell>
  );
}
