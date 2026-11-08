import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, CheckCircle2 } from 'lucide-react';
import type { PropertyImportResult } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { PROPERTY_ALIASES, PROPERTY_IMPORT_TEMPLATE, rowsFromCsv } from '../lib/csvParse';
import { Button } from '../components/ui/Button';

const MAX = 300;

export function ImportPropertiesForm({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyImportResult | null>(null);

  const run = useMutation({
    mutationFn: () => api.post<PropertyImportResult>('/properties/import', { rows }),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['properties'] }); qc.invalidateQueries({ queryKey: ['owners'] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Import failed'),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const parsed = rowsFromCsv(await file.text(), PROPERTY_ALIASES);
    if (!parsed.length) return setError('That file has no rows. Use the template if unsure.');
    if (!parsed.some((r) => r.title) || !parsed.some((r) => r.price)) {
      return setError('Could not find the property and price columns. Download the template to see the expected headers.');
    }
    if (parsed.length > MAX) return setError(`Please import ${MAX} properties at a time (this file has ${parsed.length}).`);
    setFileName(file.name);
    setRows(parsed);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([PROPERTY_IMPORT_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'kaya-properties-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-cypress-700">
          <CheckCircle2 size={18} /> <span className="font-medium">{result.created} properties imported</span>
        </div>
        <p className="text-sm text-muted">
          {result.ownersCreated} new landlords were added to Owners. {result.duplicates} skipped because they are already in Kaya.
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
        Load your portfolio from a spreadsheet. Each row needs the property name, location, price and the landlord's phone. Listing (SALE or RENT) and type default to RENT and APARTMENT. A landlord who is new also needs a name.
      </p>
      <p className="text-sm leading-relaxed text-muted">
        Landlords are matched by phone number and added to Owners if they are new. A property already in Kaya, by reference or by name and location, is skipped.
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
        {run.isPending ? 'Importing…' : rows ? `Import ${rows.length} properties` : 'Import'}
      </Button>
    </div>
  );
}
