import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { type TenantPortalView, type TenantPayStatus } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';
import { money as kes, money, setCurrency } from '../../lib/currency';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { PairedBars, Tile } from '../../components/portal/charts';
import { summariseTenant } from '../../lib/tenantSummary';
import { printTenantStatement } from '../../lib/tenantStatement';
import { Banknote, CheckCircle2, FileText, Landmark, Printer, Smartphone } from 'lucide-react';
import { localDay, localMonthShort, localPeriod } from '../../lib/localDate';

function PayNow({ token, owing, currency }: { token: string; owing: number; currency: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(owing));
  const [phone, setPhone] = useState('');
  const [other, setOther] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reqId, setReqId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => api.post<TenantPayStatus>(`/public/tenant-portal/${token}/pay`, { amount: Number(amount), ...(other && phone ? { phone } : {}) }),
    onSuccess: (r) => { setError(null); setReqId(r.id); },
    onError: (err) => setError(err instanceof ApiError ? err.message : t('tenant.payError')),
  });
  const status = useQuery({
    queryKey: ['tenant-pay', token, reqId],
    queryFn: () => api.get<TenantPayStatus>(`/public/tenant-portal/${token}/pay/${reqId}`),
    enabled: !!reqId,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' || !q.state.data ? 3000 : false),
  });
  useEffect(() => { if (status.data?.status === 'PAID') qc.invalidateQueries({ queryKey: ['tenant-portal', token] }); }, [status.data?.status, qc, token]);

  const s = status.data;
  if (reqId && s?.status === 'PAID') {
    return (
      <div className="rounded-control bg-accent-soft px-4 py-3 text-sm text-accent-deep" role="status">
        <p className="font-medium">{t('tenant.received', { amount: money(s.amount) })}</p>
        {s.receipt && <p className="mt-0.5">{t('tenant.receivedCode', { code: s.receipt })}</p>}
      </div>
    );
  }
  if (reqId && (!s || s.status === 'PENDING')) {
    return (
      <div className="rounded-control bg-sunk px-4 py-3 text-sm text-ink" role="status">
        <p className="font-medium">{t('tenant.checkPhone')}</p>
        <p className="mt-0.5 text-muted">{t('tenant.enterPin', { amount: money(Number(amount)) })}</p>
        <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => setReqId(null)}>{t('tenant.cancel')}</button>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); start.mutate(); }}>
      {reqId && s?.status === 'FAILED' && <p className="mb-3 rounded-control bg-[#fbeeee] px-3 py-2 text-sm text-danger" role="alert">{s.message ?? t('tenant.notCompleted')} {t('tenant.tryAgain')}</p>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="text-xs text-muted">{t('tenant.amount', { currency })}
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required
            className="mt-1 w-full rounded-control border border-line px-3 py-2 text-sm text-ink" />
        </label>
        <Button type="submit" className="self-end" disabled={start.isPending || !amount || Number(amount) < 10 || (other && phone.length < 9)}>{start.isPending ? t('tenant.sending') : t('tenant.payMpesa')}</Button>
      </div>
      {other ? (
        <label className="mt-3 block text-xs text-muted">{t('tenant.otherNumber')}
          <PhoneInput value={phone} onChange={setPhone} placeholder="0712345678" className="mt-1" />
        </label>
      ) : (
        <button type="button" className="mt-2 text-xs text-accent hover:underline" onClick={() => setOther(true)}>{t('tenant.otherNumberLink')}</button>
      )}
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      <p className="mt-2 text-xs text-faint">{t('tenant.pinNote')}</p>
    </form>
  );
}

function PayCard({ token, data, owing }: { token: string; data: TenantPortalView; owing: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(owing > 0 ? String(owing) : '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api.post(`/public/tenant-portal/${token}/claims`, { amount: Number(amount), mpesaCode: code }),
    onSuccess: () => { setCode(''); setError(null); qc.invalidateQueries({ queryKey: ['tenant-portal', token] }); },
    onError: (err) => setError(err instanceof ApiError ? err.message : t('tenant.sendError')),
  });
  const pending = data.claims.filter((c) => c.status === 'PENDING');
  return (
    <section className="rounded-panel border border-line bg-white p-5">
      <h2 className="font-display text-lg font-semibold text-ink">{t('tenant.payTitle')}</h2>
      {data.canPayNow && owing > 0 && <div className="mt-3"><PayNow token={token} owing={owing} currency={data.currency} /></div>}
      {data.canPayNow && owing > 0 && <p className="mt-5 text-sm font-medium text-ink">{t('tenant.paidAnother')}</p>}
      {data.payInfo ? (
        <p className="mt-2 whitespace-pre-line rounded-control bg-sunk px-4 py-3 text-sm text-ink">{data.payInfo}</p>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('tenant.askHow', { agency: data.agencyName })}</p>
      )}
      <form className="mt-4" onSubmit={(e) => { e.preventDefault(); setError(null); send.mutate(); }}>
        <p className="mb-2 text-sm font-medium text-ink">{t('tenant.alreadyPaid', { agency: data.agencyName })}</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs text-muted">{t('tenant.amount', { currency: data.currency })}
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required
              className="mt-1 w-full rounded-control border border-line px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-muted">{t('tenant.mpesaCode')}
            <input value={code} maxLength={10} autoCapitalize="characters" placeholder={t('tenant.codePlaceholder')}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} required
              className="mt-1 w-full rounded-control border border-line px-3 py-2 text-sm uppercase text-ink" />
          </label>
          <Button type="submit" className="self-end" disabled={send.isPending || !amount || code.length !== 10}>{send.isPending ? t('tenant.sending') : t('tenant.send')}</Button>
        </div>
        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
        <p className="mt-2 text-xs text-faint">{t('tenant.codeNote')}</p>
      </form>
      {data.claims.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
          {data.claims.map((c) => (
            <li key={c.mpesaCode + c.createdAt} className="flex items-center justify-between py-2">
              <span className="text-ink">{kes(c.amount)} <span className="text-muted">· {c.mpesaCode}</span></span>
              <Badge tone={c.status === 'CONFIRMED' ? 'ok' : c.status === 'REJECTED' ? 'danger' : 'warn'}>{c.status === 'PENDING' ? t('tenant.waiting') : c.status === 'CONFIRMED' ? t('tenant.confirmed') : t('tenant.notMatched')}</Badge>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && <p className="sr-only">{pending.length} payment waiting for confirmation</p>}
    </section>
  );
}

/** Private, read-only page for a tenant. The secret in the address is the only credential. */
export function PublicTenantPortal() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { token } = useParams<{ token: string }>();
  useEffect(() => {
    const tags = [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
      const m = document.createElement('meta'); m.name = name!; m.content = content!; document.head.appendChild(m); return m;
    });
    return () => tags.forEach((m) => m.remove());
  }, []);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tenant-portal', token],
    queryFn: () => api.get<TenantPortalView>(`/public/tenant-portal/${token}`),
    retry: false,
  });
  setCurrency(data?.currency);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;
  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-xl font-semibold text-ink">{t('tenant.inactiveTitle')}</h1>
          <p className="mt-2 text-sm text-muted">{t('tenant.inactiveBody')}</p>
        </div>
      </div>
    );
  }

  const { statement: s } = data;
  const owing = s.totals.balance;
  const sum = summariseTenant(s, data.dueDay);
  // Always the last six calendar months, so a young lease still reads as a timeline rather than two lonely bars.
  const rowBy = new Map(s.rows.map((r) => [r.period, r]));
  const bars = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (5 - i), 1));
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const r = rowBy.get(period);
    return { label: localMonthShort(period, lang), a: r?.charged ?? 0, b: r?.paid ?? 0 };
  });
  const dateFmt = (d: Date) => d.toLocaleDateString(lang === 'en' ? 'en-KE' : lang, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const behindText = sum.monthsBehind === 1 ? t('tenant.behindOne') : t('tenant.behind', { count: sum.monthsBehind });
  const MethodIcon = ({ m }: { m: string }) => m === 'MPESA' ? <Smartphone size={16} /> : m === 'BANK' ? <Landmark size={16} /> : m === 'CHEQUE' ? <FileText size={16} /> : <Banknote size={16} />;
  const monthly = [...s.rows].reverse();
  return (
    <div className="min-h-screen bg-ground">
      <header className="bg-ink px-5 pb-24 pt-6 text-white sm:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/60">{data.agencyName}</p>
          <LanguageSwitcher dark />
        </div>
        <div className="mx-auto mt-8 max-w-3xl">
          <p className="text-sm text-white/70">{t('tenant.hello', { name: data.tenantName.split(' ')[0] })}</p>
          <p className="mt-1 text-sm text-white/50">{t('tenant.summary', { property: data.propertyTitle, rent: kes(data.rentAmount), day: data.dueDay })}</p>
          {owing > 0 ? (
            <>
              <p className="mt-8 text-xs font-medium uppercase tracking-[0.14em] text-white/60">{t('tenant.dueNow')}</p>
              <p className="mt-1 font-display text-5xl font-semibold tabular-nums sm:text-6xl">{kes(owing)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {sum.monthsBehind > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">{behindText}</span>}
                <a href="#pay" className="rounded-control bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-white/90">{t('tenant.payNow')}</a>
              </div>
            </>
          ) : (
            <>
              <p className="mt-8 flex items-center gap-2.5 font-display text-3xl font-semibold sm:text-4xl"><CheckCircle2 size={30} className="text-[#7be0a6]" />{t('tenant.allPaid')}</p>
              <p className="mt-2 text-sm text-white/60">{t('tenant.allPaidSub')}</p>
              {sum.nextDue && <p className="mt-4 text-sm text-white/80">{t('tenant.nextRent', { amount: kes(data.rentAmount), date: dateFmt(sum.nextDue) })}</p>}
            </>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-14 max-w-3xl space-y-8 px-4 pb-10 sm:px-6">
        <section aria-labelledby="sum-h">
          <h2 id="sum-h" className="sr-only">{t('tenant.yourSummary')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t('tenant.totalPaid')} value={kes(sum.totalPaid)} sub={t('tenant.totalPaidSub')} />
            <Tile label={t('tenant.onTime')} value={sum.monthsDue ? t('tenant.onTimeValue', { ok: sum.monthsOnTime, total: sum.monthsDue }) : '–'} sub={t('tenant.onTimeSub')} />
            <Tile label={t('tenant.charged2')} value={kes(sum.chargedToDate)} />
            <Tile label={t('tenant.lastPayment')} value={sum.lastPayment ? kes(sum.lastPayment.amount) : t('tenant.noPayments')} sub={sum.lastPayment ? localDay(sum.lastPayment.paidAt, lang) : undefined} />
          </div>
        </section>

        {s.rows.length > 0 && (
          <section className="rounded-panel border border-line bg-white p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">{t('tenant.chart')}</h2>
            <PairedBars data={bars} aLabel={t('tenant.chartDue')} bLabel={t('tenant.chartPaid')} />
          </section>
        )}

        <div id="pay"><PayCard token={token!} data={data} owing={owing} /></div>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">{t('tenant.payments')}</h2>
            {s.rows.length > 0 && <button type="button" onClick={() => printTenantStatement(data.agencyName, s)} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"><Printer size={14} />{t('tenant.statement')}</button>}
          </div>
          {sum.payments.length === 0 ? (
            <p className="rounded-panel border border-line bg-white p-5 text-sm text-muted">{t('tenant.paymentsEmpty')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-white">
              {sum.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunk text-ink"><MethodIcon m={p.method} /></span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{t(`tenant.methods.${p.method}`, { defaultValue: p.method.toLowerCase() })}{p.reference ? <span className="font-normal text-muted"> · {p.reference}</span> : null}</p>
                      <p className="text-xs text-muted">{localDay(p.paidAt, lang)} · {t('tenant.forMonth', { month: localPeriod(p.period, lang) })}</p>
                    </div>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-ink">{kes(p.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">{t('tenant.monthly')}</h2>
          {monthly.length === 0 ? (
            <p className="rounded-panel border border-line bg-white p-5 text-sm text-muted">{t('tenant.noRent')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-white">
              {monthly.map((r) => {
                const due = r.charged - r.paid;
                return (
                  <li key={r.period} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink">{localPeriod(r.period, lang)}</p>
                      <p className="text-xs text-muted">
                        {t('tenant.chargedAmount', { amount: kes(r.charged) })}{r.extras.length > 0 ? t('tenant.including', { items: r.extras.map((x) => x.label).join(', ') }) : ''}
                      </p>
                    </div>
                    {due <= 0 ? <Badge tone="ok">{t('tenant.paidBadge')}</Badge> : <Badge tone={r.paid > 0 ? 'warn' : 'danger'}>{t('tenant.dueBadge', { amount: kes(due) })}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-panel border border-line bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink">{t('tenant.fixTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('tenant.fixBody', { agency: data.agencyName })}</p>
          <Link to={`/report/${data.agencySlug}`} className="mt-3 inline-block text-sm font-medium text-brand underline">{t('tenant.report')}</Link>
        </section>
        <p className="pb-6 text-center text-xs text-faint">{t('tenant.private')}</p>
      </main>
    </div>
  );
}
