// The agency's currency for the current session. Set once from the signed-in user (or from a public
// portal's own data), so screens and printable documents format money the same way without threading a
// currency through every component.
let current = 'KES';

export const setCurrency = (code: string | null | undefined) => { if (code) current = code; };
export const currencyCode = () => current;
export const money = (n: number) => `${n < 0 ? '-' : ''}${current} ${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
