import { useState } from 'react';
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

const nice = (s: string) => s[0] + s.slice(1).toLowerCase();

/** Public page where a tenant reports a fault. Linked from the agency's Settings. */
export function PublicRepair() {
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
          <h1 className="font-display text-xl font-semibold text-ink">Page not found</h1>
          <p className="mt-2 text-sm text-muted">This link doesn't match an agency on Kaya.</p>
        </div>
      </div>
    );
  }

  if (submit.isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="max-w-sm text-center">
          <CheckCircle2 size={36} className="mx-auto text-cypress-600" />
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Report received</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Thanks, {fullName.split(' ')[0]}. {data.name} has been told and will follow up with you.
            {urgent && ' For a real emergency such as a burst pipe or fire, please also call them directly.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-white px-6 py-10 text-center sm:px-10">
        <div className="flex justify-center">
          <BrandMark logoUrl={data.logoUrl} name={data.name} brandColor={data.brandColor} size={48} />
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-faint">{data.name}</p>
        <h1 className="mx-auto mt-2 max-w-md font-display text-2xl font-semibold text-ink sm:text-3xl">Report a problem</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Something broken at your home? Tell us and your agent will arrange a fix.
        </p>
      </header>
      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="rounded-panel border border-line bg-white p-6 shadow-card">
          <Field label="Your name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label="Phone number">
            <PhoneInput value={phone} onChange={setPhone} placeholder="The number you gave your agent" required />
          </Field>
          <Field label="What kind of problem?">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {MAINTENANCE_CATEGORIES.map((c) => <option key={c} value={c}>{nice(c)}</option>)}
            </Select>
          </Field>
          <Field label="What is wrong?">
            <TextArea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} minLength={5} maxLength={2000} required placeholder="e.g. Water is leaking under the kitchen sink" />
          </Field>
          <label className="mb-4 flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-0.5" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>This is urgent (flooding, no power, a security risk)</span>
          </label>
          <div className="hidden" aria-hidden="true">
            <label htmlFor="website">Leave this field empty</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {submit.isError && (
            <p className="mb-3 text-sm text-danger">
              {submit.error instanceof ApiError ? submit.error.message : 'Something went wrong. Please try again.'}
            </p>
          )}
          <Button type="submit" disabled={submit.isPending} className="w-full">{submit.isPending ? 'Sending…' : 'Send report'}</Button>
        </form>
      </main>
    </div>
  );
}
