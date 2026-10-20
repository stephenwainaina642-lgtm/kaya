import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_TYPES } from '@kaya/shared';
import type { ClientListItem, PropertyListItem, OwnerListItem, Page, DealBoard } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { Field } from '../components/ui/Field';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';

export function UploadDocumentForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1]);
  const [linkKind, setLinkKind] = useState<'clientId' | 'propertyId' | 'ownerId' | 'dealId'>('clientId');
  const [linkId, setLinkId] = useState('');
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: clients } = useQuery({
    queryKey: ['clients-picker'],
    queryFn: () => api.get<Page<ClientListItem>>('/clients', { pageSize: 100 }),
    enabled: linkKind === 'clientId',
  });
  const { data: properties } = useQuery({
    queryKey: ['properties-picker'],
    queryFn: () => api.get<Page<PropertyListItem>>('/properties', { pageSize: 100 }),
    enabled: linkKind === 'propertyId',
  });
  const { data: owners } = useQuery({
    queryKey: ['owners-picker'],
    queryFn: () => api.get<Page<OwnerListItem>>('/owners', { pageSize: 100 }),
    enabled: linkKind === 'ownerId',
  });
  const { data: board } = useQuery({
    queryKey: ['deals-board-picker'],
    queryFn: () => api.get<DealBoard>('/deals/board'),
    enabled: linkKind === 'dealId',
  });
  const deals = board?.stages.flatMap((s) => s.deals) ?? [];

  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('file required');
      const form = new FormData();
      form.append('file', file);
      if (name.trim()) form.append('name', name.trim());
      form.append('type', type);
      form.append(linkKind, linkId);
      form.append('requiresSignature', String(requiresSignature));
      return api.postForm('/documents', form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'),
  });

  function handleFile(f: File | null) {
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.[^/.]+$/, ''));
  }

  const linkOptions =
    linkKind === 'clientId' ? clients?.items.map((c) => ({ id: c.id, label: c.fullName })) :
    linkKind === 'propertyId' ? properties?.items.map((p) => ({ id: p.id, label: p.title })) :
    linkKind === 'ownerId' ? owners?.items.map((o) => ({ id: o.id, label: o.fullName ?? o.companyName ?? 'Owner' })) :
    deals.map((d) => ({ id: d.id, label: d.name }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); upload.mutate(); }}>
      <Field label="File">
        <input
          type="file"
          required
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="block w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-sunk file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
        />
      </Field>
      <Field label="Name (optional)">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the file name" />
      </Field>
      <Field label="Document type">
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Link to">
          <Select
            value={linkKind}
            onChange={(e) => { setLinkKind(e.target.value as typeof linkKind); setLinkId(''); }}
          >
            <option value="clientId">Client</option>
            <option value="propertyId">Property</option>
            <option value="ownerId">Owner</option>
            <option value="dealId">Deal</option>
          </Select>
        </Field>
        <Field label="Record">
          <Select value={linkId} onChange={(e) => setLinkId(e.target.value)} required>
            <option value="">Select…</option>
            {linkOptions?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
      </div>
      {linkKind === 'clientId' && (
        <label className="mb-4 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={requiresSignature} onChange={(e) => setRequiresSignature(e.target.checked)} />
          Ask the client to sign this through their portal
        </label>
      )}
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={upload.isPending || !file || !linkId} className="w-full">
        {upload.isPending ? 'Uploading…' : 'Upload document'}
      </Button>
    </form>
  );
}
