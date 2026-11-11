import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Download, Wrench } from 'lucide-react';
import { periodLabel, type PortalView } from '@kaya/shared';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { PairedBars, Ring, Tile } from '../../components/portal/charts';
import { money as kes, setCurrency } from '../../lib/currency';
import { downloadStatementPdf } from '../../lib/statementPdf';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ');
const shortMonth = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

/** Private, read-only page for a landlord. The secret in the address is the only credential. */
export function PublicPortal() {
  const { token } = useParams<{ token: string }>();
  // Keep the private link out of search results and out of Referer headers.
  useEffect(() => {
    const tags = [['robots', 'noindex, nofollow'], ['referrer', 'no-referrer']].map(([name, content]) => {
      const m = document.createElement('meta'); m.name = name!; m.content = content!; document.head.appendChild(m); return m;
    });
    return () => tags.forEach((m) => m.remove());
  }, []);
  const [period, setPeriod] = useState(thisMonth());
  const { data, isLoading, isError } = useQuery({
    queryKey: ['portal', token, period],
    queryFn: () => api.get<PortalView>(`/public/portal/${token}`, { period }),
    retry: false,
    placeholderData: (prev) => prev,
  });
  setCurrency(data?.currency);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-ground"><Spinner /></div>;
  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-xl font-semibold text-ink">This link is not active</h1>
          <p className="mt-2 text-sm text-muted">It may have been turned off or replaced. Ask your agent for a new one.</p>
        </div>
      </div>
    );
  }

  const { statement: s, portfolio: pf, trend, owing } = data;
  const t = s.totals;
  const rate = t.rentDue > 0 ? t.collected / t.rentDue : 0;
  const vacant = data.units.filter((u) => u.state === 'VACANT');
  const bars = trend.map((p) => ({ label: shortMonth(p.period), a: p.expected, b: p.collected }));
  const hasHistory = trend.some((p) => p.expected > 0 || p.collected > 0);

  return (
    <div className="min-h-screen bg-ground">
      <header className="bg-ink px-5 pb-28 pt-6 text-white sm:px-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/60">{data.agencyName}</p>
          <div className="w-44 [&_input]:border-white/20 [&_input]:bg-white/10 [&_input]:text-white [&_input]:[color-scheme:dark]">
            <Input type="month" aria-label="Month" value={period} max={thisMonth()} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
          </div>
        </div>
        <div className="mx-auto mt-8 grid max-w-4xl gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-sm text-white/70">Hello, {data.ownerName.split(' ')[0]}</p>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-white/60">Paid to you · {periodLabel(data.period)}</p>
            <p className="mt-1 font-display text-5xl font-semibold tabular-nums sm:text-6xl">{kes(t.netToLandlord)}</p>
            <p className="mt-3 max-w-md text-sm text-white/60">
              {t.rentDue > 0
                ? `${kes(t.collected)} collected of ${kes(t.rentDue)} due (${Math.round(rate * 100)}%), less ${kes(t.managementFee + t.withholding)} in fees and tax${t.maintenance > 0 ? ` and ${kes(t.maintenance)} in repairs` : ''}.`
                : 'No rent was raised for your properties this month.'}
            </p>
          </div>
          {s.lines.length > 0 && (
            <button type="button" onClick={() => void downloadStatementPdf(s, data.agencyName)}
              className="inline-flex items-center justify-center gap-2 rounded-control bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white/90">
              <Download size={15} /> Statement PDF
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-16 max-w-4xl space-y-8 px-4 pb-10 sm:px-6">
        <section aria-label="Business summary" className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-4 rounded-panel border border-line bg-white p-4">
            <Ring value={pf.occupancy} label="Occupancy" />
            <div>
              <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted">Occupancy</p>
              <p className="mt-1 font-display text-xl font-semibold text-ink">{pf.let} of {pf.units} let</p>
              <p className="text-xs text-muted">{pf.vacant > 0 ? `${pf.vacant} vacant` : 'Fully let'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Rent roll" value={kes(pf.monthlyRent)} sub="per month, all tenants" />
            <Tile label="Collected" value={t.rentDue > 0 ? `${Math.round(rate * 100)}%` : '–'} sub={periodLabel(data.period)} />
            <div className="col-span-2 sm:col-span-1"><Tile label="Owed by tenants" value={kes(pf.owedByTenants)} sub={pf.owedByTenants > 0 ? `${owing.length} tenant${owing.length === 1 ? '' : 's'} behind` : 'Nobody is behind'} /></div>
          </div>
        </section>

        {hasHistory && (
          <section className="rounded-panel border border-line bg-white p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Last 6 months</h2>
            <PairedBars data={bars} aLabel="Rent due" bLabel="Collected" />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-medium">Month</th><th className="py-2 pr-3 text-right font-medium">Collected</th><th className="py-2 text-right font-medium">Paid to you</th>
                </tr></thead>
                <tbody>
                  {[...trend].reverse().map((p) => (
                    <tr key={p.period} className="border-b border-line last:border-0">
                      <td className="py-2 pr-3 text-ink">{periodLabel(p.period)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-muted">{kes(p.collected)}</td>
                      <td className="whitespace-nowrap py-2 text-right font-medium tabular-nums text-ink">{kes(p.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(owing.length > 0 || data.openRepairs.length > 0 || pf.leasesEndingSoon > 0 || vacant.length > 0) && (
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Needs attention</h2>
            <ul className="divide-y divide-line rounded-panel border border-line bg-white text-sm">
              {owing.slice(0, 5).map((o) => (
                <li key={o.propertyTitle + o.tenantName} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3"><AlertTriangle size={16} className="shrink-0 text-[#b45309]" />
                    <div className="min-w-0"><p className="truncate font-medium text-ink">{o.tenantName} is behind on rent</p><p className="truncate text-xs text-muted">{o.propertyTitle} · {o.months} month{o.months === 1 ? '' : 's'}</p></div></div>
                  <p className="shrink-0 font-semibold tabular-nums text-ink">{kes(o.amount)}</p>
                </li>
              ))}
              {owing.length > 5 && (
                <li className="flex items-center justify-between gap-3 px-4 py-3 text-muted">
                  <p>and {owing.length - 5} more tenants behind on rent</p>
                  <p className="shrink-0 font-semibold tabular-nums text-ink">{kes(owing.slice(5).reduce((n, o) => n + o.amount, 0))}</p>
                </li>
              )}
              {pf.leasesEndingSoon > 0 && (
                <li className="flex items-center gap-3 px-4 py-3"><CalendarClock size={16} className="shrink-0 text-muted" />
                  <p className="text-ink">{pf.leasesEndingSoon} lease{pf.leasesEndingSoon === 1 ? ' ends' : 's end'} within 60 days. Your agent will be in touch about renewals.</p></li>
              )}
              {vacant.length > 0 && (
                <li className="flex items-center gap-3 px-4 py-3"><Badge tone="warn">Vacant</Badge>
                  <p className="text-ink">{vacant.length} unit{vacant.length === 1 ? ' is' : 's are'} empty, about {kes(vacant.reduce((n, u) => n + (u.listingType === 'RENT' ? u.listPrice : 0), 0))} a month in rent not being earned.</p></li>
              )}
              {data.openRepairs.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3"><Wrench size={16} className="shrink-0 text-muted" />
                    <div className="min-w-0"><p className="truncate font-medium text-ink">{r.title}</p><p className="truncate text-xs text-muted">{r.propertyTitle} · reported {new Date(r.createdAt).toLocaleDateString('en-KE')}</p></div></div>
                  <Badge tone={r.priority === 'URGENT' ? 'danger' : 'neutral'}>{nice(r.status)}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.lines.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Statement · {periodLabel(data.period)}</h2>
            <div className="overflow-x-auto rounded-panel border border-line bg-white">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Property</th><th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3 text-right">Rent due</th><th className="px-4 py-3 text-right">Collected</th><th className="px-4 py-3 text-right">To you</th>
                </tr></thead>
                <tbody>
                  {s.lines.map((l) => (
                    <tr key={l.leaseId} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{l.propertyTitle}</td><td className="px-4 py-3">{l.tenantName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{kes(l.rentDue)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{kes(l.collected)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{kes(l.netToLandlord)}</td>
                    </tr>
                  ))}
                  {s.deductions.map((d) => (
                    <tr key={d.requestId} className="border-b border-line text-muted last:border-0">
                      <td className="px-4 py-3" colSpan={4}>Repair: {d.title} ({d.propertyTitle})</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">− {kes(d.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">Your properties</h2>
            {data.units.some((u) => u.advertised) && <p className="text-sm text-muted">{data.units.filter((u) => u.advertised).length} being advertised</p>}
          </div>
          <ul className="divide-y divide-line rounded-panel border border-line bg-white">
            {data.units.map((u) => (
              <li key={u.propertyTitle + u.location + (u.unitNumber ?? '')} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  {u.coverImageUrl && <img src={u.coverImageUrl} alt="" loading="lazy" className="h-11 w-14 shrink-0 rounded-control object-cover" />}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{u.propertyTitle}</p>
                    <p className="truncate text-xs text-muted">{u.location}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {u.state === 'LET' ? (
                    <><p className="text-ink">{u.tenantName}</p><p className="text-xs tabular-nums text-muted">{kes(u.rent ?? 0)} a month</p></>
                  ) : (
                    <>
                      <Badge tone={u.state === 'VACANT' ? 'warn' : 'neutral'}>{u.state === 'VACANT' ? 'Vacant' : 'Not available'}</Badge>
                      <p className="mt-1 text-xs text-muted">Listed at {kes(u.listPrice)}{u.listingType === 'RENT' ? ' a month' : ''}</p>
                      {u.listingPath && <a href={u.listingPath} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Advertised: view listing</a>}
                    </>
                  )}
                </div>
              </li>
            ))}
            {data.units.length === 0 && <li className="px-4 py-3 text-sm text-muted">No properties yet.</li>}
          </ul>
        </section>
        <p className="pb-6 text-center text-xs text-faint">This page is private to you. Please do not share the link.</p>
      </main>
    </div>
  );
}
