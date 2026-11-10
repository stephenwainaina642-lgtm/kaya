/** Mirrors the server's unit numbering (floor 3, position 2 -> 302; ground floor -> G02). */
export function unitLabelsPreview(floors: number, perFloor: number, startFloor: number): string[] {
  const out: string[] = [];
  if (floors < 1 || perFloor < 1 || floors * perFloor > 5000) return out;
  for (let f = 0; f < floors; f++) {
    const floor = startFloor + f;
    for (let n = 1; n <= perFloor; n++) out.push(`${floor === 0 ? 'G' : floor}${String(n).padStart(2, '0')}`);
  }
  return out;
}
