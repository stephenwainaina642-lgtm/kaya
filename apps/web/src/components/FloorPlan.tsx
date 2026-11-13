import type { MaintenanceItem } from '@kaya/shared';

type Room = 'living' | 'kitchen' | 'entry' | 'bedroom' | 'bath' | 'store';
interface Cell { key: string; kind: Room; x: number; y: number; w: number; h: number; label: string }
type Issue = Pick<MaintenanceItem, 'id' | 'title' | 'category'>;

const INK = '#1c2430';
const LINE = '#c9ced6';
const FIXTURE = '#aab2be';
const DANGER = '#b42318';

/** Which room a repair belongs in, judged from what it says. Anything unplaceable lands in the living area. */
function roomFor(i: Issue): Room {
  const t = `${i.title} ${i.category}`.toLowerCase();
  if (/bath|toilet|shower|tap|basin|flush|drain|plumb|leak/.test(t)) return 'bath';
  if (/kitchen|sink|cooker|oven|fridge/.test(t)) return 'kitchen';
  if (/bedroom|wardrobe/.test(t)) return 'bedroom';
  return 'living';
}

function layout(beds: number, baths: number): Cell[] {
  const cells: Cell[] = [
    { key: 'living', kind: 'living', x: 16, y: 16, w: 234, h: 154, label: 'Living' },
    { key: 'kitchen', kind: 'kitchen', x: 16, y: 170, w: 124, h: 104, label: 'Kitchen' },
    { key: 'entry', kind: 'entry', x: 140, y: 170, w: 110, h: 104, label: 'Entry' },
  ];
  const cw = 334 / 3, ch = 129;
  const slot = (n: number) => ({ x: 250 + (n % 3) * cw, y: 16 + Math.floor(n / 3) * ch, w: cw, h: ch });
  const order = [0, 1, 3, 4, 2, 5];
  const b = Math.min(Math.max(beds, 1), 4), t = Math.min(Math.max(baths, 1), 2);
  let n = 0;
  for (let i = 0; i < b; i++) cells.push({ key: `bed${i}`, kind: 'bedroom', ...slot(order[n++]!), label: i === 0 && b > 1 ? 'Main bedroom' : b === 1 ? 'Bedroom' : `Bedroom ${i + 1}` });
  for (let i = 0; i < t; i++) cells.push({ key: `bath${i}`, kind: 'bath', ...slot(order[n++]!), label: t > 1 ? `Bath ${i + 1}` : 'Bathroom' });
  while (n < 6) cells.push({ key: `store${n}`, kind: 'store', ...slot(order[n++]!), label: '' });
  return cells;
}

function Fixtures({ c }: { c: Cell }) {
  const p = { fill: 'none', stroke: FIXTURE, strokeWidth: 1.25 } as const;
  switch (c.kind) {
    case 'bedroom': return (
      <g {...p}><rect x={c.x + c.w / 2 - 28} y={c.y + c.h - 76} width={56} height={64} rx={5} /><rect x={c.x + c.w / 2 - 23} y={c.y + c.h - 71} width={20} height={12} rx={4} /><rect x={c.x + c.w / 2 + 3} y={c.y + c.h - 71} width={20} height={12} rx={4} /></g>);
    case 'bath': return (
      <g {...p}><rect x={c.x + 10} y={c.y + c.h - 46} width={62} height={34} rx={9} /><circle cx={c.x + c.w - 24} cy={c.y + c.h - 30} r={9} /><rect x={c.x + c.w - 36} y={c.y + 34} width={24} height={14} rx={4} /></g>);
    case 'kitchen': return (
      <g {...p}><rect x={c.x + 8} y={c.y + 32} width={c.w - 16} height={16} rx={2} /><rect x={c.x + 8} y={c.y + 32} width={16} height={c.h - 44} rx={2} /><circle cx={c.x + c.w - 30} cy={c.y + 40} r={4} /></g>);
    case 'living': return (
      <g {...p}><rect x={c.x + 20} y={c.y + c.h - 54} width={128} height={38} rx={12} /><circle cx={c.x + c.w - 62} cy={c.y + c.h - 58} r={22} /><rect x={c.x + c.w - 34} y={c.y + 18} width={18} height={44} rx={3} /></g>);
    case 'entry': return (<g {...p}><path d={`M ${c.x + c.w - 4} ${c.y + c.h} A 44 44 0 0 0 ${c.x + c.w - 48} ${c.y + c.h - 44}`} /></g>);
    default: return null;
  }
}

/** A drawn plan of the unit, sized from its bedrooms and bathrooms. Open repairs are pinned to the room they concern. */
export function FloorPlan({ bedrooms, bathrooms, issues, unit }: { bedrooms: number | null; bathrooms: number | null; issues: Issue[]; unit: string }) {
  const cells = layout(bedrooms ?? 1, bathrooms ?? 1);
  const pins = new Map<string, number>();
  for (const i of issues) {
    const kind = roomFor(i);
    const target = cells.find((c) => c.kind === kind) ?? cells[0]!;
    pins.set(target.key, (pins.get(target.key) ?? 0) + 1);
  }
  return (
    <svg viewBox="0 0 600 290" className="block h-auto w-full" role="img" aria-label={`Floor plan of unit ${unit}${issues.length ? `, ${issues.length} open ${issues.length === 1 ? 'repair' : 'repairs'}` : ''}`}>
      <rect x={4} y={4} width={592} height={282} rx={14} fill="#fbfbfc" stroke={INK} strokeWidth={2.5} />
      {cells.map((c) => {
        const n = pins.get(c.key) ?? 0;
        return (
          <g key={c.key}>
            <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={n ? '#fdf1ef' : c.kind === 'store' ? '#f3f4f6' : 'transparent'} stroke={n ? DANGER : LINE} strokeWidth={n ? 1.75 : 1.25} />
            {c.label && <text x={c.x + 10} y={c.y + 20} fontSize={10} letterSpacing={1.1} fill={n ? DANGER : '#6b7480'} style={{ textTransform: 'uppercase', fontWeight: 600 }}>{c.label}</text>}
            <Fixtures c={c} />
            {n > 0 && (
              <g>
                <circle cx={c.x + c.w - 16} cy={c.y + 16} r={11} fill={DANGER} opacity={0.25}>
                  <animate attributeName="r" values="11;19;11" dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
                </circle>
                <circle cx={c.x + c.w - 16} cy={c.y + 16} r={10} fill={DANGER} />
                <text x={c.x + c.w - 16} y={c.y + 20} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">{n}</text>
              </g>
            )}
          </g>
        );
      })}
      <rect x={4} y={4} width={592} height={282} rx={14} fill="none" stroke={INK} strokeWidth={2.5} />
    </svg>
  );
}
