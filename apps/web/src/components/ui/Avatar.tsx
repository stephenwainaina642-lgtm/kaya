function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

export function Avatar({ name, size = 32 }: { name: string; size?: number; onDark?: boolean }) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-sunk font-medium text-ink ring-1 ring-inset ring-line"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
