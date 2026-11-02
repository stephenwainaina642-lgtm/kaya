/**
 * Minimal RFC 4180 CSV writer. Cells that start with = + - @ (or a tab/CR)
 * are prefixed with an apostrophe so a spreadsheet never evaluates a
 * customer-supplied value as a formula ("CSV injection").
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (Array.isArray(value)) s = value.join('; ');
  else if (typeof value === 'object') s = JSON.stringify(value);
  else s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(cell).join(',')];
  for (const row of rows) lines.push(headers.map((h) => cell(row[h])).join(','));
  // BOM so Excel opens UTF-8 (names, Swahili/French accents) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
