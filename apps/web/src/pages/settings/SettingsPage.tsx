import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Check, ExternalLink, Upload, Trash2 } from 'lucide-react';
import type { InquiryLink, OrgBranding } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { BrandMark } from '../../components/BrandMark';

function InquiryLinkCard() {
  const { data } = useQuery({
    queryKey: ['inquiry-link'],
    queryFn: () => api.get<InquiryLink>('/leads/inquiry-link'),
  });
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const url = `${window.location.origin}/inquire/${data.slug}`;

  return (
    <Card className="max-w-lg p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Your public inquiry page</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Share this link anywhere — your website, WhatsApp bio, Instagram — and every submission becomes a lead here,
        automatically assigned by your automation rules.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Input readOnly value={url} className="bg-sunk text-muted" onFocus={(e) => e.target.select()} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </Button>
        <a href={url} target="_blank" rel="noreferrer">
          <Button type="button" variant="secondary"><ExternalLink size={15} /></Button>
        </a>
      </div>
    </Card>
  );
}

function BrandingCard() {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState(user?.brandColor ?? '#2F5D4E');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canEdit = user?.role === 'ORG_ADMIN';

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const onBranding = (branding: OrgBranding) => {
    updateUser({ logoUrl: branding.logoUrl, brandColor: branding.brandColor });
    setError(null);
    flash();
  };
  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong');

  const saveColor = useMutation({
    mutationFn: () => api.patch<OrgBranding>('/org/branding', { brandColor: color }),
    onSuccess: onBranding,
    onError,
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.postForm<OrgBranding>('/org/logo', form);
    },
    onSuccess: onBranding,
    onError,
  });

  const removeLogo = useMutation({
    mutationFn: () => api.del<OrgBranding>('/org/logo'),
    onSuccess: onBranding,
    onError,
  });

  if (!canEdit) return null;

  return (
    <Card className="max-w-lg p-5">
      <h2 className="mb-1 font-display text-lg font-semibold text-ink">Workspace branding</h2>
      <p className="mb-4 text-sm text-muted">
        Shown in your sidebar and on the public pages clients see — your inquiry form and shared shortlists.
      </p>

      <div className="mb-5 flex items-center gap-4">
        <BrandMark logoUrl={user?.logoUrl} name={user?.organizationName ?? 'Kaya'} brandColor={user?.brandColor} size={56} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo.mutate(f); e.target.value = ''; }}
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploadLogo.isPending}>
            <Upload size={14} /> {uploadLogo.isPending ? 'Uploading…' : 'Upload logo'}
          </Button>
          {user?.logoUrl && (
            <Button type="button" variant="secondary" onClick={() => removeLogo.mutate()} disabled={removeLogo.isPending}>
              <Trash2 size={14} /> Remove
            </Button>
          )}
        </div>
      </div>

      <Field label="Accent color">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-control border border-line bg-white p-0.5"
          />
          <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
          <Button type="button" variant="secondary" onClick={() => saveColor.mutate()} disabled={saveColor.isPending}>
            {saveColor.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Field>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {saved && <p className="mt-3 text-sm text-cypress-700">Branding updated.</p>}
    </Card>
  );
}

export function SettingsPage() {
  const { user, updateUser } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const saveProfile = useMutation({
    mutationFn: () => api.patch<{ name: string }>('/auth/me', { name }),
    onSuccess: (res) => {
      updateUser({ name: res.name });
      setProfileSaved(true);
      setProfileError(null);
      setTimeout(() => setProfileSaved(false), 2000);
    },
    onError: (err) => setProfileError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const changePassword = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setPasswordSaved(true);
      setPasswordError(null);
      setTimeout(() => setPasswordSaved(false), 2000);
    },
    onError: (err) => setPasswordError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6 p-8">
        <InquiryLinkCard />
        <BrandingCard />

        <Card className="max-w-lg p-5">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Your account</h2>
          <form onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }}>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <dl className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Email</dt><dd className="text-ink">{user?.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Role</dt><dd className="text-ink">{user?.role.replace('_', ' ')}</dd></div>
            </dl>
            {profileError && <p className="mb-3 text-sm text-danger">{profileError}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saveProfile.isPending || !name}>
                {saveProfile.isPending ? 'Saving…' : 'Save profile'}
              </Button>
              {profileSaved && <span className="text-sm text-cypress-700">Saved.</span>}
            </div>
          </form>
        </Card>

        <Card className="max-w-lg p-5">
          <h2 className="mb-4 font-display text-lg font-semibold text-ink">Change password</h2>
          <form onSubmit={(e) => { e.preventDefault(); changePassword.mutate(); }}>
            <Field label="Current password">
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </Field>
            <Field label="New password">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required />
            </Field>
            {passwordError && <p className="mb-3 text-sm text-danger">{passwordError}</p>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={changePassword.isPending || !currentPassword || newPassword.length < 8}>
                {changePassword.isPending ? 'Saving…' : 'Change password'}
              </Button>
              {passwordSaved && <span className="text-sm text-cypress-700">Password updated.</span>}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
