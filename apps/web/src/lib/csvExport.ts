/** Download rows as a CSV that opens cleanly in Excel (UTF-8 BOM, quoted cells, formula-injection guard). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === 'string') s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const body = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
