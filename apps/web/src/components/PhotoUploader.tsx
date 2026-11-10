import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Button } from './ui/Button';

const MAX_FILES = 10;
const MAX_BYTES = 8 * 1024 * 1024;

/** Pick photos, see them before sending, upload to one endpoint. Used for a single unit or a whole building. */
export function PhotoUploader({ endpoint, fields, submitLabel = 'Upload photos', onDone }: {
  endpoint: string;
  fields?: Record<string, string>;
  submitLabel?: string;
  onDone: (result: unknown) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setError(`${f.name} isn't a JPG, PNG or WebP image.`); continue; }
      if (f.size > MAX_BYTES) { setError(`${f.name} is over 8 MB.`); continue; }
      if (next.length < MAX_FILES) next.push(f);
    }
    setFiles(next);
  };

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      Object.entries(fields ?? {}).forEach(([k, v]) => form.append(k, v));
      files.forEach((f) => form.append('files', f));
      return api.postForm(endpoint, form);
    },
    onSuccess: onDone,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Upload failed. Try again.'),
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}
        className="flex w-full flex-col items-center gap-2 rounded-panel border border-dashed border-[#cfd5dd] bg-sunk px-4 py-8 text-sm text-muted hover:border-ink hover:text-ink"
      >
        <ImagePlus size={22} />
        <span><span className="font-medium text-ink">Choose photos</span> or drop them here</span>
        <span className="text-xs text-faint">JPG, PNG or WebP · up to {MAX_FILES} photos · 8 MB each</span>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { setError(null); add(e.target.files); e.target.value = ''; }} />
      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}${i}`} className="relative aspect-[4/3] overflow-hidden rounded-control bg-sunk">
              <img src={previews[i]} alt={f.name} className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-ink/80 px-1.5 py-0.5 text-[0.65rem] text-white">Cover</span>}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-ink hover:bg-white"><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      <Button type="button" className="mt-4 w-full" disabled={files.length === 0 || upload.isPending} onClick={() => { setError(null); upload.mutate(); }}>
        {upload.isPending ? 'Uploading…' : `${submitLabel}${files.length ? ` (${files.length})` : ''}`}
      </Button>
    </div>
  );
}
