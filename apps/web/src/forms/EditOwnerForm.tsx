import { LanguageField, type Lang } from '../components/LanguageField';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OwnerDetail } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { PhoneInput } from '../components/ui/PhoneInput';
import { TextArea } from '../components/ui/TextArea';
import { Button } from '../components/ui/Button';

export function EditOwnerForm({ owner, onDone }: { owner: OwnerDetail; onDone: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(owner.fullName ?? '');
  const [companyName, setCompanyName] = useState(owner.companyName ?? '');
  const [phone, setPhone] = useState(owner.phone);
  const [email, setEmail] = useState(owner.email ?? '');
  const [language, setLanguage] = useState<Lang>(owner.language ?? 'en');
  const [notes, setNotes] = useState(owner.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/owners/${owner.id}`, {
        fullName: fullName || null, companyName: companyName || null, phone, email: email || null, language, notes: notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owners'] });
      qc.invalidateQueries({ queryKey: ['owner', owner.id] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label="Company name (optional)">
        <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
      </Field>
      <Field label="Phone">
        <PhoneInput value={phone} onChange={setPhone} required />
      </Field>
      <Field label="Email (optional)">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <LanguageField value={language} onChange={setLanguage} />
      <Field label="Notes (optional)">
        <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={update.isPending} className="w-full">
        {update.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
