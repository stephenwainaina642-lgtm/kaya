import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { periodLabel, type TenantPortalView } from '@kaya/shared';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;

/** Private, read-only page for a tenant. The secret in the address is the only credential. */
export function PublicTenantPortal() {
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
  const owing = s.totals.balance;
  const rows = [...s.rows].reverse();
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-white px-6 py-8 sm:px-10">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{data.agencyName}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Hello, {data.tenantName.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-muted">{data.propertyTitle} · {kes(data.rentAmount)} a month, due on day {data.dueDay}</p>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        <section className="grid grid-cols-3 gap-3">
          {[['Charged', s.totals.charged], ['Paid', s.totals.paid], [owing > 0 ? 'You owe' : 'Balance', owing]].map(([label, value]) => (
            <div key={label as string} className="rounded-panel border border-line bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-1 font-display text-lg font-semibold text-ink sm:text-xl">{kes(value as number)}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-ink">Rent history</h2>
          {rows.length === 0 ? (
            <p className="rounded-panel border border-line bg-white p-5 text-sm text-muted">No rent has been raised yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-white">
              {rows.map((r) => {
                const due = r.charged - r.paid;
                return (
                  <li key={r.period} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{periodLabel(r.period)}</p>
                        <p className="text-xs text-muted">
                          {kes(r.charged)} charged{r.extras.length > 0 ? ` (incl. ${r.extras.map((x) => x.label).join(', ')})` : ''}
                        </p>
                      </div>
                      {due <= 0 ? <Badge tone="ok">Paid</Badge> : <Badge tone={r.paid > 0 ? 'warn' : 'danger'}>{kes(due)} due</Badge>}
                    </div>
                    {r.payments.map((p) => (
                      <p key={p.id} className="mt-1 text-xs text-muted">
                        {new Date(p.paidAt).toLocaleDateString('en-KE')} · {kes(p.amount)} by {p.method.toLowerCase().replace('_', ' ')}{p.reference ? ` (${p.reference})` : ''}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-panel border border-line bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Something needs fixing?</h2>
          <p className="mt-1 text-sm text-muted">Tell {data.agencyName} about a repair and they will follow up.</p>
          <Link to={`/report/${data.agencySlug}`} className="mt-3 inline-block text-sm font-medium text-brand underline">Report a problem</Link>
        </section>
        <p className="pb-6 text-center text-xs text-faint">This page is private to you. Please do not share the link.</p>
      </main>
    </div>
  );
}
