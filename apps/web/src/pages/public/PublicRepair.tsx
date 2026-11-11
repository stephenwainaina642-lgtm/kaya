import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { MAINTENANCE_CATEGORIES, type PublicOrgInfo } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { Select } from '../../components/ui/Select';
import { TextArea } from '../../components/ui/TextArea';
import { Button } from '../../components/ui/Button';
import { BrandMark } from '../../components/BrandMark';
import { VoiceButton } from '../../components/VoiceButton';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

/** Public page where a tenant reports a fault. Linked from the agency's Settings. */
export function PublicRepair() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-org', slug],
    queryFn: () => api.get<PublicOrgInfo>(`/public/organizations/${slug}`),
    retry: false,
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [urgent, setUrgent] = useState(false);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  const submit = useMutation({
    mutationFn: () => api.post(`/public/organizations/${slug}/repair-reports`, { fullName, phone, category, urgent, message, website }),
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold text-ink">{t('repair.notFound')}</h1>
          <p className="mt-2 text-sm text-muted">{t('repair.notFoundBody')}</p>
        </div>
      </div>
    );
  }

  if (submit.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="max-w-sm text-center">
          <CheckCircle2 size={36} className="mx-auto text-cypress-600" />
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">{t('repair.received')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t('repair.thanks', { name: fullName.split(' ')[0], agency: data.name })}
            {urgent && t('repair.emergency')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground">
      <header className="relative border-b border-line bg-white px-6 py-10 text-center sm:px-10">
        <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
        <div className="flex justify-center">
          <BrandMark logoUrl={data.logoUrl} name={data.name} brandColor={data.brandColor} size={48} />
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-faint">{data.name}</p>
        <h1 className="mx-auto mt-2 max-w-md font-display text-2xl font-semibold text-ink sm:text-3xl">{t('repair.title')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {t('repair.intro')}
        </p>
      </header>
      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="rounded-panel border border-line bg-white p-6 shadow-card">
          <Field label={t('repair.name')}>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label={t('repair.phone')}>
            <PhoneInput value={phone} onChange={setPhone} placeholder={t('repair.phonePh')} required />
          </Field>
          <Field label={t('repair.kind')}>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {MAINTENANCE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`repair.categories.${c}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('repair.what')}>
            <TextArea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} minLength={5} maxLength={2000} required placeholder={t('repair.whatPh')} />
            <VoiceButton onText={(x) => setMessage((m) => (m ? `${m} ${x}` : x).slice(0, 2000))} />
          </Field>
          <label className="mb-4 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-0.5" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>{t('repair.urgent')}</span>
          </label>
          <div className="hidden" aria-hidden="true">
            <label htmlFor="website">Leave this field empty</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {submit.isError && (
            <p className="mb-3 text-sm text-danger">
              {submit.error instanceof ApiError ? submit.error.message : t('repair.error')}
            </p>
          )}
          <Button type="submit" disabled={submit.isPending} className="w-full">{submit.isPending ? t('repair.sending') : t('repair.send')}</Button>
        </form>
      </main>
    </div>
  );
}
