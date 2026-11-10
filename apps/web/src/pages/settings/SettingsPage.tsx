import type { MpesaSettingsView } from '@kaya/shared';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, ExternalLink, Upload, Trash2, Download } from 'lucide-react';
import { planHasModule, BILLING_MONTHS, PLAN_LABELS, PLAN_PRICE_KES, quoteKes, type BillingMonths, type BillingOverview, type BillingPayment, type InquiryLink, type OrgBranding, type Plan } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { PhoneInput } from '../../components/ui/PhoneInput';
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
      <p className="mt-3 text-sm text-muted">
        Properties you switch on to advertise appear on your{' '}
        <a href={`${window.location.origin}/listings/${data.slug}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">public listings page</a>.
      </p>
    </Card>
  );
}

function PaymentInfoCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['branding'], queryFn: () => api.get<OrgBranding>('/org/branding') });
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.patch<OrgBranding>('/org/branding', { rentPaymentInfo: (text ?? '').trim() || null }),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1800); qc.invalidateQueries({ queryKey: ['branding'] }); },
  });
  if (!data) return null;
  const value = text ?? data.rentPaymentInfo ?? '';
  return (
    <Card className="max-w-lg p-5">
      <h2 className="text-lg font-semibold text-ink">How tenants pay you</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">Shown on every tenant's rent link, above the box where they send their M-Pesa code.</p>
      <textarea
        value={value} maxLength={600} rows={4} onChange={(e) => setText(e.target.value)}
        placeholder={'Paybill 247247\nAccount: your unit number, e.g. A4\nOr bank: Equity 0123456789'}
        className="mt-3 w-full rounded-control border border-line px-3 py-2 text-sm text-ink"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" disabled={save.isPending || text === null} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        {saved && <span className="flex items-center gap-1 text-sm text-ok"><Check size={14} /> Saved</span>}
      </div>
    </Card>
  );
}

function MpesaCollectionCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['mpesa-settings'], queryFn: () => api.get<MpesaSettingsView>('/rent/mpesa-settings') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ mode: 'production', accountType: 'PAYBILL', shortcode: '', consumerKey: '', consumerSecret: '', passkey: '' });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.put<MpesaSettingsView>('/rent/mpesa-settings', f),
    onSuccess: () => { setOpen(false); setError(null); setF({ ...f, consumerKey: '', consumerSecret: '', passkey: '' }); qc.invalidateQueries({ queryKey: ['mpesa-settings'] }); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });
  const remove = useMutation({ mutationFn: () => api.del('/rent/mpesa-settings'), onSuccess: () => qc.invalidateQueries({ queryKey: ['mpesa-settings'] }) });
  if (!data) return null;
  const input = 'mt-1 w-full rounded-control border border-line px-3 py-2 text-sm text-ink';
  return (
    <Card className="max-w-lg p-5">
      <h2 className="text-lg font-semibold text-ink">Collect rent by M-Pesa</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Let tenants pay from their rent link with an M-Pesa PIN prompt. Money goes straight into your own paybill or till, and the payment is recorded against their balance automatically.
      </p>
      {data.configured && !open ? (
        <div className="mt-3 space-y-3 text-sm">
          <p className="rounded-control bg-[#edf5f0] px-3 py-2 text-ok">On: {data.accountType === 'TILL' ? 'Till' : 'Paybill'} {data.shortcode} ({data.mode === 'production' ? 'live' : 'sandbox'})</p>
          {data.callbackUrl && <p className="break-all text-xs text-muted">Callback URL: <span className="select-all text-ink">{data.callbackUrl}</span></p>}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => { setF({ ...f, mode: data.mode, accountType: data.accountType, shortcode: data.shortcode ?? '' }); setOpen(true); }}>Change</Button>
            <Button type="button" variant="secondary" disabled={remove.isPending} onClick={() => { if (confirm('Turn off paying by M-Pesa prompt? Tenants will see your payment instructions instead.')) remove.mutate(); }}>Turn off</Button>
          </div>
        </div>
      ) : !open ? (
        <Button type="button" className="mt-3" onClick={() => setOpen(true)}>Set up</Button>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
          <p className="text-xs leading-relaxed text-faint">Get these from your app on developer.safaricom.co.ke (Daraja). They are stored encrypted and never shown again.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">Account type
              <select value={f.accountType} onChange={(e) => setF({ ...f, accountType: e.target.value })} className={input}><option value="PAYBILL">Paybill</option><option value="TILL">Till (Buy Goods)</option></select>
            </label>
            <label className="text-xs text-muted">Environment
              <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} className={input}><option value="production">Live</option><option value="sandbox">Sandbox (testing)</option></select>
            </label>
          </div>
          <label className="block text-xs text-muted">Shortcode<input inputMode="numeric" value={f.shortcode} onChange={(e) => setF({ ...f, shortcode: e.target.value.replace(/\D/g, '') })} required className={input} /></label>
          <label className="block text-xs text-muted">Consumer key<input value={f.consumerKey} onChange={(e) => setF({ ...f, consumerKey: e.target.value })} required={!data.configured} placeholder={data.configured ? 'Leave blank to keep the saved key' : ''} autoComplete="off" className={input} /></label>
          <label className="block text-xs text-muted">Consumer secret<input type="password" value={f.consumerSecret} onChange={(e) => setF({ ...f, consumerSecret: e.target.value })} required={!data.configured} placeholder={data.configured ? 'Leave blank to keep' : ''} autoComplete="off" className={input} /></label>
          <label className="block text-xs text-muted">Passkey<input type="password" value={f.passkey} onChange={(e) => setF({ ...f, passkey: e.target.value })} required={!data.configured} placeholder={data.configured ? 'Leave blank to keep' : ''} autoComplete="off" className={input} /></label>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Checking with Safaricom…' : 'Save'}</Button>
            <Button type="button" variant="secondary" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function RepairLinkCard() {
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['inquiry-link'], queryFn: () => api.get<InquiryLink>('/leads/inquiry-link') });
  const [copied, setCopied] = useState(false);
  if (!data || !user || !planHasModule(user.plan, 'rentManagement')) return null;
  const url = `${window.location.origin}/report/${data.slug}`;
  return (
    <Card className="max-w-lg p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Tenant repair link</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Send this to your tenants, for example in a WhatsApp group. They report a fault with the phone number on their lease, and it lands in Maintenance linked to their property, with a follow-up for the property's agent.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Input readOnly value={url} className="bg-sunk text-muted" onFocus={(e) => e.target.select()} />
        <Button type="button" variant="secondary" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </Button>
        <a href={url} target="_blank" rel="noreferrer"><Button type="button" variant="secondary"><ExternalLink size={15} /></Button></a>
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

const EXPORTS = [
  { entity: 'leads', label: 'Leads' },
  { entity: 'clients', label: 'Clients' },
  { entity: 'owners', label: 'Owners' },
  { entity: 'properties', label: 'Properties' },
] as const;

function ExportCard() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (user?.role !== 'ORG_ADMIN') return null;

  const run = async (entity: string) => {
    setBusy(entity);
    setError(null);
    try {
      await api.download(`/export/${entity}`, `kaya-${entity}.csv`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="max-w-lg p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Export your data</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Your data is yours. Download any list as a CSV that opens in Excel or Google Sheets. Exports are recorded in your audit log.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {EXPORTS.map(({ entity, label }) => (
          <Button key={entity} type="button" variant="secondary" disabled={busy !== null} onClick={() => run(entity)}>
            <Download size={15} className="mr-1.5" />
            {busy === entity ? 'Preparing…' : label}
          </Button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Card>
  );
}

const PAID_PLANS: Plan[] = ['STARTER', 'GROWTH', 'PRO'];

function BillingCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [plan, setPlan] = useState<Plan>('GROWTH');
  const [months, setMonths] = useState<BillingMonths>(1);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ['billing'], queryFn: () => api.get<BillingOverview>('/billing'), enabled: user?.role === 'ORG_ADMIN' });
  const { data: payment } = useQuery({
    queryKey: ['billing-payment', paymentId],
    queryFn: () => api.get<BillingPayment>(`/billing/payments/${paymentId}`),
    enabled: !!paymentId,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 3000 : false),
  });
  const status = payment?.status;
  useEffect(() => {
    // Refresh plan and history once the result is known.
    if (status === 'PAID' || status === 'FAILED') qc.invalidateQueries({ queryKey: ['billing'] });
  }, [status, qc]);

  const pay = useMutation({
    mutationFn: () => api.post<BillingPayment>('/billing/checkout', { plan, months, phone }),
    onSuccess: (p) => { setError(null); setPaymentId(p.id); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  if (user?.role !== 'ORG_ADMIN' || !data) return null;
  const total = quoteKes(plan, data.seats, months);
  const waiting = pay.isPending || payment?.status === 'PENDING';

  return (
    <Card className="max-w-lg p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Plan & billing</h2>
      <p className="mt-1 text-sm text-muted">
        You are on <strong className="text-ink">{PLAN_LABELS[data.effectivePlan]}</strong>
        {data.expiresAt && data.plan !== 'STARTER' ? ` · ${data.effectivePlan === data.plan ? 'renews by' : 'lapsed on'} ${new Date(data.expiresAt).toLocaleDateString('en-KE')}` : ''}
        {' · '}{data.seats} {data.seats === 1 ? 'agent' : 'agents'}
      </p>
      {!data.paymentsEnabled ? (
        <p className="mt-4 rounded-control bg-sunk p-3 text-sm text-muted">Online payment isn't switched on for this workspace yet. Contact support to change plan.</p>
      ) : (
        <form className="mt-4" onSubmit={(e) => { e.preventDefault(); setError(null); setPaymentId(null); pay.mutate(); }}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {PAID_PLANS.map((p) => (
              <button key={p} type="button" onClick={() => setPlan(p)}
                className={`rounded-control border px-3 py-2 text-left text-sm transition ${plan === p ? 'border-cypress-600 bg-cypress-50 text-cypress-700' : 'border-line text-ink hover:bg-sunk'}`}>
                <span className="block font-medium">{PLAN_LABELS[p]}</span>
                <span className="text-xs text-muted">KES {PLAN_PRICE_KES[p].toLocaleString('en-KE')}/agent</span>
              </button>
            ))}
          </div>
          <div className="mb-3 flex gap-2">
            {BILLING_MONTHS.map((m) => (
              <button key={m} type="button" onClick={() => setMonths(m)}
                className={`rounded-control border px-3 py-1.5 text-sm ${months === m ? 'border-cypress-600 bg-cypress-50 text-cypress-700' : 'border-line text-ink hover:bg-sunk'}`}>
                {m === 1 ? 'Monthly' : 'Yearly · 2 months free'}
              </button>
            ))}
          </div>
          <Field label="M-Pesa number">
            <PhoneInput value={phone} onChange={setPhone} placeholder="0712 345 678" required />
          </Field>
          <Button type="submit" disabled={waiting || phone.trim().length < 9}>
            {waiting ? 'Check your phone…' : `Pay KES ${total.toLocaleString('en-KE')} with M-Pesa`}
          </Button>
          {payment?.status === 'PENDING' && <p className="mt-3 text-sm text-muted">Enter your M-Pesa PIN on the prompt we sent to your phone.</p>}
          {payment?.status === 'PAID' && <p className="mt-3 text-sm text-cypress-700">Payment received{payment.mpesaReceipt ? ` (${payment.mpesaReceipt})` : ''}. Your plan is updated. Reload to unlock new features.</p>}
          {payment?.status === 'FAILED' && <p className="mt-3 text-sm text-danger">{payment.failureReason ?? 'The payment did not go through.'} You have not been charged.</p>}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </form>
      )}
      {data.payments.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Payment history</p>
          <ul className="space-y-1.5 text-sm">
            {data.payments.slice(0, 6).map((p) => (
              <li key={p.id} className="flex justify-between">
                <span className="text-ink">{new Date(p.createdAt).toLocaleDateString('en-KE')} · {PLAN_LABELS[p.plan]} · {p.months === 12 ? 'yearly' : 'monthly'}</span>
                <span className={p.status === 'PAID' ? 'text-cypress-700' : p.status === 'FAILED' ? 'text-danger' : 'text-muted'}>KES {p.amount.toLocaleString('en-KE')} · {p.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
        <PaymentInfoCard />
        <MpesaCollectionCard />
        <RepairLinkCard />
        <BrandingCard />
        <BillingCard />
        <ExportCard />

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
