import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Megaphone } from 'lucide-react';
import type { BuildingDetail as BuildingDetailT } from '@kaya/shared';
import { formatMoney } from '@kaya/shared';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { OccupancyBar } from './BuildingsList';

const TILE: Record<string, string> = {
  LET: 'border-ink bg-ink text-white',
  AVAILABLE: 'border-[#cfe3d8] bg-[#edf5f0] text-ok',
};

export function BuildingDetail() {
  const { name = '' } = useParams<{ name: string }>();
  const qc = useQueryClient();
  const { data: b, isLoading } = useQuery({
    queryKey: ['buildings', name],
    queryFn: () => api.get<BuildingDetailT>(`/properties/buildings/${encodeURIComponent(name)}`),
  });
  const advertise = useMutation({
    mutationFn: (advertised: boolean) => api.post(`/properties/buildings/${encodeURIComponent(name)}/advertise`, { advertised }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['buildings', name] }); qc.invalidateQueries({ queryKey: ['properties'] }); },
  });

  if (isLoading || !b) return (<><PageHeader title={name} /><Spinner /></>);
  const live = b.unitList.filter((u) => u.advertised && u.status === 'AVAILABLE').length;

  // Group by floor (everything before the last two digits) for a readable block diagram.
  const floors = new Map<string, typeof b.unitList>();
  for (const u of b.unitList) {
    const label = u.unitNumber ?? '';
    const floor = label.length > 2 ? label.slice(0, -2) : '–';
    floors.set(floor, [...(floors.get(floor) ?? []), u]);
  }
  const ordered = [...floors.entries()].sort((x, y) => (y[0] === 'G' ? -1 : x[0] === 'G' ? 1 : Number(y[0]) - Number(x[0])));

  return (
    <>
      <PageHeader
        title={b.building}
        subtitle={`${b.location}, ${b.city}${b.ownerNames.length ? ` · ${b.ownerNames.join(', ')}` : ''}`}
        actions={
          <div className="flex items-center gap-3">
            <Button variant="secondary" disabled={advertise.isPending} onClick={() => advertise.mutate(live === 0)}>
              <Megaphone size={14} /> {live === 0 ? 'Advertise vacant units' : `Advertising ${live} unit${live === 1 ? '' : 's'} · stop`}
            </Button>
            <Link to="/buildings" className="flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft size={16} /> All buildings</Link>
          </div>
        }
      />
      <div className="space-y-6 p-8">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
          {[
            ['Occupancy', `${b.occupancyPct}%`, `${b.occupied} of ${b.units} units`],
            ['Vacant', String(b.vacant), 'ready to let'],
            ['Rent roll', formatMoney(b.monthlyRent, b.currency, { compact: true }), `of ${formatMoney(b.potentialRent, b.currency, { compact: true })} potential`],
            ['Arrears', formatMoney(b.arrears, b.currency, { compact: true }), b.arrears > 0 ? 'overdue now' : 'all up to date'],
          ].map(([k, v, sub]) => (
            <div key={k} className="bg-white p-5">
              <p className="text-sm text-muted">{k}</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${k === 'Arrears' && b.arrears > 0 ? 'text-danger' : 'text-ink'}`}>{v}</p>
              <p className="text-xs text-faint">{sub}</p>
            </div>
          ))}
        </div>
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Units</h2>
            <div className="flex items-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm bg-ink" /> Occupied</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-[#cfe3d8] bg-[#edf5f0]" /> Vacant</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm border border-line bg-sunk" /> Other</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-sm ring-2 ring-danger" /> In arrears</span>
            </div>
          </div>
          <div className="mb-5"><OccupancyBar {...b} /></div>
          <div className="space-y-2">
            {ordered.map(([floor, units]) => (
              <div key={floor} className="flex items-start gap-3">
                <span className="w-8 shrink-0 pt-2 text-right text-xs tabular-nums text-faint">{floor}</span>
                <div className="flex flex-wrap gap-2">
                  {units.map((u) => (
                    <Link
                      key={u.id}
                      to={`/properties/${u.id}`}
                      title={`${u.title}${u.tenantName ? ` — ${u.tenantName}` : ''}${u.arrears ? ` — owes ${formatMoney(u.arrears, b.currency)}` : ''}`}
                      className={`relative flex h-14 w-20 flex-col items-center justify-center rounded-control border text-xs font-medium tabular-nums transition-transform hover:-translate-y-0.5 ${TILE[u.status] ?? 'border-line bg-sunk text-muted'} ${u.arrears > 0 ? 'ring-2 ring-danger ring-offset-1' : ''}`}
                    >
                      <span className="text-sm font-semibold">{u.unitNumber}</span>
                      <span className="max-w-full truncate px-1 text-[0.65rem] opacity-80">{u.tenantName ? u.tenantName.split(' ')[0] : formatMoney(u.price, b.currency, { compact: true })}</span>
                      {u.advertised && u.status === 'AVAILABLE' && <Megaphone size={10} className="absolute right-1 top-1 opacity-70" aria-label="Advertised" />}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
