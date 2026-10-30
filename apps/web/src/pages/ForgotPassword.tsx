import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthShell } from '../components/AuthShell';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('forgot.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell eyebrow={t('forgot.eyebrow')} headline={t('forgot.headline')} subhead={t('forgot.subhead')}>
      <div className="mb-6 flex justify-center lg:justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="mb-2 font-display text-2xl font-semibold text-ink">{t('forgot.title')}</h1>
      <p className="mb-8 text-sm text-muted">{t('forgot.subtitle')}</p>
      {sent ? (
        <div className="rounded-panel border border-line bg-surface p-6 shadow-card">
          <p className="text-sm text-ink">{t('forgot.sent', { email })}</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="rounded-panel border border-line bg-surface p-6 shadow-card">
          <label className="mb-1 block text-sm font-medium text-ink">{t('login.email')}</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mb-4" />
          {error && <p className="mb-4 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? t('forgot.sending') : t('forgot.submit')}</Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted lg:text-left">
        <Link to="/login" className="font-medium text-cypress-700 hover:underline">{t('forgot.backToSignIn')}</Link>
      </p>
    </AuthShell>
  );
}
