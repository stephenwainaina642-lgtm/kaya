import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import type { PublicOrgInfo } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { TextArea } from '../../components/ui/TextArea';
import { Button } from '../../components/ui/Button';
import { BrandMark } from '../../components/BrandMark';

const LOOKING_FOR = [
  { value: 'BUYER', label: 'Buying' },
  { value: 'TENANT', label: 'Renting' },
  { value: 'SELLER', label: 'Selling' },
  { value: 'LANDLORD', label: 'Letting out a property' },
];

export function PublicInquiry() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const propertyId = params.get('property');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-org', slug],
    queryFn: () => api.get<PublicOrgInfo>(`/public/organizations/${slug}`),
    retry: false,
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [leadType, setLeadType] = useState('BUYER');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/public/organizations/${slug}/inquiries`, {
        fullName, phone, email: email || undefined, leadType, message: message || undefined, propertyId, website,
      }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <Spinner />
      </div>
    );
  }

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
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Thanks, {fullName.split(' ')[0]}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {data.name} has received your enquiry and will be in touch shortly.
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
        <h1 className="mx-auto mt-2 max-w-md font-display text-2xl font-semibold text-ink sm:text-3xl">
          Tell us what you're looking for
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Leave your details and an agent will reach out to help.
        </p>
      </header>
      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <form
          onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
          className="rounded-panel border border-line bg-white p-6 shadow-card"
        >
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label="Phone number">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" required />
          </Field>
          <Field label="Email (optional)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="I'm looking to">
            <Select value={leadType} onChange={(e) => setLeadType(e.target.value)}>
              {LOOKING_FOR.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Anything else? (optional)">
            <TextArea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Budget, preferred area, timeline…" />
          </Field>
          {/* Honeypot: hidden from real visitors via CSS, so only bots fill it in. */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="website">Leave this field empty</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {submit.isError && (
            <p className="mb-3 text-sm text-danger">
              {submit.error instanceof ApiError ? submit.error.message : 'Something went wrong — please try again.'}
            </p>
          )}
          <Button type="submit" disabled={submit.isPending} className="w-full">
            {submit.isPending ? 'Sending…' : 'Send enquiry'}
          </Button>
        </form>
      </main>
    </div>
  );
}
