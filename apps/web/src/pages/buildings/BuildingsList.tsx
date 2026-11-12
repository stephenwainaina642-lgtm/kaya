import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, MapPin, Building } from 'lucide-react';
import type { BuildingSummary } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { NewBuildingForm } from '../../forms/NewBuildingForm';

export function OccupancyBar({ occupied, vacant, other, units }: { occupied: number; vacant: number; other: number; units: number }) {
  const pct = (n: number) => (units ? (n / units) * 100 : 0);
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-sunk" role="img" aria-label={`${occupied} occupied, ${vacant} vacant of ${units} units`}>
      <div className="bg-ink" style={{ width: `${pct(occupied)}%` }} />
      <div className="bg-[#cfd5dd]" style={{ width: `${pct(other)}%` }} />
      <div className="bg-ok/40" style={{ width: `${pct(vacant)}%` }} />
    </div>
  );
}

export function BuildingsList() {
  const nav = useNavigate();
  const [showNew, setShowNew] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['buildings'], queryFn: () => api.get<BuildingSummary[]>('/properties/buildings') });

  const totals = (data ?? []).reduce((t, b) => ({
    units: t.units + b.units, occupied: t.occupied + b.occupied, rent: t.rent + b.monthlyRent, arrears: t.arrears + b.arrears,
  }), { units: 0, occupied: 0, rent: 0, arrears: 0 });
  const currency = data?.[0]?.currency ?? 'KES';

  return (
    <>
      <PageHeader
        title="Buildings"
        subtitle="Every unit of every estate you manage, with live occupancy and rent."
        actions={<Button onClick={() => setShowNew(true)}><Plus size={14} /> New building</Button>}
      />
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New building" width="max-w-xl">
        <NewBuildingForm onDone={(name) => { setShowNew(false); nav(`/buildings/${encodeURIComponent(name)}`); }} />
      </Modal>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {isLoading ? <Spinner /> : !data?.length ? (
          <div className="flex flex-col items-center">
            <EmptyState
              icon={<Building size={20} />}
              title="No buildings yet"
              body="Create a building once and Kaya generates every flat in it, numbered by floor, ready to let, advertise and collect rent on."
            />
            <Button onClick={() => setShowNew(true)}><Plus size={14} /> New building</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
              {[
                ['Buildings', String(data.length)],
                ['Units', totals.units.toLocaleString()],
                ['Occupancy', `${totals.units ? Math.round((totals.occupied / totals.units) * 100) : 0}%`],
                ['Monthly rent roll', formatMoney(totals.rent, currency, { compact: true })],
              ].map(([k, v]) => (
                <div key={k} className="bg-white p-5">
                  <p className="text-sm text-muted">{k}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{v}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.map((b) => (
                <Link key={b.building} to={`/buildings/${encodeURIComponent(b.building)}`} className="group block focus-visible:outline-offset-4">
                  <Card className="p-5 transition-shadow group-hover:shadow-lift">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-ink">{b.building}</h2>
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><MapPin size={13} /> {b.location}, {b.city}</p>
                      </div>
                      <p className="shrink-0 text-right text-2xl font-semibold tabular-nums text-ink">{b.occupancyPct}<span className="text-sm text-muted">%</span></p>
                    </div>
                    <div className="mt-4"><OccupancyBar {...b} /></div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div><dt className="text-faint">Units</dt><dd className="font-medium tabular-nums text-ink">{b.units}</dd></div>
                      <div><dt className="text-faint">Vacant</dt><dd className="font-medium tabular-nums text-ink">{b.vacant}</dd></div>
                      <div><dt className="text-faint">Arrears</dt><dd className={`font-medium tabular-nums ${b.arrears > 0 ? 'text-danger' : 'text-ink'}`}>{formatMoney(b.arrears, b.currency, { compact: true })}</dd></div>
                    </dl>
                    <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
                      {formatMoney(b.monthlyRent, b.currency, { compact: true })} of {formatMoney(b.potentialRent, b.currency, { compact: true })} a month
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
            {totals.arrears > 0 && <p className="text-sm text-muted">Total arrears across buildings: <span className="font-medium text-danger">{formatMoney(totals.arrears, currency)}</span></p>}
          </>
        )}
      </div>
    </>
  );
}
