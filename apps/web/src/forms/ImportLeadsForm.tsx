import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import type { LeadImportResult } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { IMPORT_TEMPLATE, rowsFromCsv } from '../lib/csvParse';
import { Button } from '../components/ui/Button';

const MAX = 500;

export function ImportLeadsForm({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeadImportResult | null>(null);

  const run = useMutation({
    mutationFn: () => api.post<LeadImportResult>('/leads/import', { rows }),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['onboarding'] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Import failed'),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const parsed = rowsFromCsv(await file.text());
    if (!parsed.length) return setError('That file has no rows. Use the template below if unsure.');
    if (!parsed.some((r) => r.phone)) return setError('Could not find a phone column. Expected a header like "phone" or "mobile".');
    if (parsed.length > MAX) return setError(`Please import ${MAX} leads at a time (this file has ${parsed.length}).`);
    setFileName(file.name);
    setRows(parsed);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'kaya-leads-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cypress-700">
          <CheckCircle2 size={18} /> <span className="font-medium">{result.created} leads imported</span>
        </div>
        <p className="text-sm text-muted">
          {result.duplicates} skipped (phone number already in Kaya or repeated in the file).
          {result.invalid.length > 0 && ` ${result.invalid.length} rows had problems:`}
        </p>
        {result.invalid.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-auto rounded-md bg-sunk p-3 text-sm text-ink">
            {result.invalid.slice(0, 50).map((i) => <li key={i.row}>Row {i.row}: {i.reason}</li>)}
          </ul>
        )}
        <Button onClick={onDone}>Done</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        Upload a CSV (export from Excel or Google Sheets). We match common column names like name, phone, email, source and notes.
        Phone numbers are tidied to +254 format, and numbers already in Kaya are skipped.
      </p>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
          <Upload size={15} className="mr-1.5" /> {fileName || 'Choose CSV file'}
        </Button>
        <Button type="button" variant="ghost" onClick={downloadTemplate}>
          <Download size={15} className="mr-1.5" /> Template
        </Button>
      </div>
      {rows && <p className="text-sm text-ink">{rows.length} rows ready to import.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button disabled={!rows || run.isPending} onClick={() => run.mutate()}>
        {run.isPending ? 'Importing…' : rows ? `Import ${rows.length} leads` : 'Import'}
      </Button>
    </div>
  );
}
