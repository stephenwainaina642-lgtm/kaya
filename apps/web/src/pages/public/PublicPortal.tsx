import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { periodLabel, type PortalView } from '@kaya/shared';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const nice = (s: string) => s[0] + s.slice(1).toLowerCase().replace('_', ' ');

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

  const { statement: s } = data;
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-white px-6 py-8 sm:px-10">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{data.agencyName}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Hello, {data.ownerName.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-muted">Your properties, rent and repairs, kept up to date by your agent.</p>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">Statement · {periodLabel(data.period)}</h2>
            <div className="w-44"><Input type="month" value={period} max={thisMonth()} onChange={(e) => e.target.value && setPeriod(e.target.value)} /></div>
          </div>
          {s.lines.length === 0 ? (
            <p className="rounded-panel border border-line bg-white p-5 text-sm text-muted">No rent was raised for your properties in this month.</p>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3">
                {[['Collected', s.totals.collected], ['Agent fee and tax', s.totals.managementFee + s.totals.withholding], ['Paid to you', s.totals.netToLandlord]].map(([label, value]) => (
                  <div key={label as string} className="rounded-panel border border-line bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                    <p className="mt-1 font-display text-lg font-semibold text-ink sm:text-xl">{kes(value as number)}</p>
                  </div>
                ))}
              </div>
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
                        <td className="whitespace-nowrap px-4 py-3 text-right">{kes(l.rentDue)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{kes(l.collected)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{kes(l.netToLandlord)}</td>
                      </tr>
                    ))}
                    {s.deductions.map((d) => (
                      <tr key={d.requestId} className="border-b border-line text-muted last:border-0">
                        <td className="px-4 py-3" colSpan={4}>Repair: {d.title} ({d.propertyTitle})</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">− {kes(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Your properties</h2>
          <ul className="divide-y divide-line rounded-panel border border-line bg-white">
            {data.units.map((u) => (
              <li key={u.propertyTitle + u.location} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div><p className="font-medium text-ink">{u.propertyTitle}</p><p className="text-xs text-muted">{u.location}</p></div>
                <div className="text-right">
                  {u.tenantName ? <><p className="text-ink">{u.tenantName}</p><p className="text-xs text-muted">{kes(u.rent ?? 0)} a month</p></> : <Badge tone="warn">Vacant</Badge>}
                </div>
              </li>
            ))}
            {data.units.length === 0 && <li className="px-4 py-3 text-sm text-muted">No properties yet.</li>}
          </ul>
        </section>

        {data.openRepairs.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Open repairs</h2>
            <ul className="divide-y divide-line rounded-panel border border-line bg-white">
              {data.openRepairs.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div><p className="font-medium text-ink">{r.title}</p><p className="text-xs text-muted">{r.propertyTitle} · reported {new Date(r.createdAt).toLocaleDateString('en-KE')}</p></div>
                  <Badge tone={r.priority === 'URGENT' ? 'danger' : 'neutral'}>{nice(r.status)}</Badge>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="pb-6 text-center text-xs text-faint">This page is private to you. Please do not share the link.</p>
      </main>
    </div>
  );
}
