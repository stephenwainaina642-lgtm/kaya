function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function Avatar({ name, size = 32, onDark = false }: { name: string; size?: number; onDark?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full font-medium ring-1 ring-inset ${onDark ? 'bg-white/[0.07] text-spine-bright ring-white/15' : 'bg-cypress-50 text-cypress-700 ring-cypress-100'}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
