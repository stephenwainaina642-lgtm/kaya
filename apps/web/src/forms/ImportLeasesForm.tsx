import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import type { LeaseImportResult } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { LEASE_ALIASES, LEASE_IMPORT_TEMPLATE, rowsFromCsv } from '../lib/csvParse';
import { Button } from '../components/ui/Button';

const MAX = 200;

export function ImportLeasesForm({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeaseImportResult | null>(null);

  const run = useMutation({
    mutationFn: () => api.post<LeaseImportResult>('/rent/leases/import', { rows }),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['rent'] }); qc.invalidateQueries({ queryKey: ['clients'] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Import failed'),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const parsed = rowsFromCsv(await file.text(), LEASE_ALIASES);
    if (!parsed.length) return setError('That file has no rows. Use the template if unsure.');
    if (!parsed.some((r) => r.property) || !parsed.some((r) => r.rent)) {
      return setError('Could not find the property and rent columns. Download the template to see the expected headers.');
    }
    if (parsed.length > MAX) return setError(`Please import ${MAX} leases at a time (this file has ${parsed.length}).`);
    setFileName(file.name);
    setRows(parsed);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([LEASE_IMPORT_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'kaya-leases-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cypress-700">
          <CheckCircle2 size={18} /> <span className="font-medium">{result.created} leases imported</span>
        </div>
        <p className="text-sm text-muted">
          {result.tenantsCreated} new tenants were added to Clients. {result.skipped} skipped because the property already has an active lease.
          {result.invalid.length > 0 && ` ${result.invalid.length} rows had problems:`}
        </p>
        {result.invalid.length > 0 && (
          <ul className="max-h-48 space-y-1 overflow-auto rounded-md bg-sunk p-3 text-sm text-ink">
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
        Move your existing tenancies in from a spreadsheet. Each row needs the property (exactly as it is named in Kaya), the tenant's name and phone, the monthly rent and the start date. Deposit, due day, end date and management fee % are optional. Dates can be DD/MM/YYYY.
      </p>
      <p className="text-sm leading-relaxed text-muted">
        Add your properties first, because they hold the landlord. Tenants are matched by phone number and added to Clients if they are new.
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
        {run.isPending ? 'Importing…' : rows ? `Import ${rows.length} leases` : 'Import'}
      </Button>
    </div>
  );
}
