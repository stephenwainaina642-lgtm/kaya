import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BedDouble, Bath, CalendarClock, FileText, PenLine, CheckCircle2 } from 'lucide-react';
import type { PublicShortlist as PublicShortlistT } from '@kaya/shared';
import { formatKes } from '@kaya/shared';
import { api, ApiError } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { TextArea } from '../../components/ui/TextArea';
import { SignaturePad, type SignaturePadHandle } from '../../components/SignaturePad';

function RequestViewingModal({
  token, propertyId, propertyTitle, onClose,
}: { token: string; propertyId: string | null; propertyTitle: string; onClose: () => void }) {
  const [preferredAt, setPreferredAt] = useState('');
  const [notes, setNotes] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/public/shortlists/${token}/viewing-requests`, {
        propertyId,
        preferredAt: new Date(preferredAt).toISOString(),
        notes: notes || undefined,
      }),
  });

  if (submit.isSuccess) {
    return (
      <Modal open onClose={onClose} title="Request sent">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 size={36} className="text-cypress-600" />
          <p className="text-sm text-ink">Your viewing request has been sent. The agent will confirm a time with you shortly.</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Request a viewing — ${propertyTitle}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
        <Field label="Preferred date & time">
          <Input type="datetime-local" value={preferredAt} onChange={(e) => setPreferredAt(e.target.value)} required />
        </Field>
        <Field label="Anything else? (optional)">
          <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I'm free weekday evenings after 6pm" />
        </Field>
        {submit.isError && (
          <p className="mb-3 text-sm text-danger">{submit.error instanceof ApiError ? submit.error.message : 'Something went wrong — please try again.'}</p>
        )}
        <Button type="submit" disabled={submit.isPending} className="w-full">
          {submit.isPending ? 'Sending…' : 'Send request'}
        </Button>
      </form>
    </Modal>
  );
}

function SignDocumentModal({
  token, documentId, documentName, onClose, onSigned,
}: { token: string; documentId: string; documentName: string; onClose: () => void; onSigned: () => void }) {
  const [signerName, setSignerName] = useState('');
  const [padError, setPadError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  const submit = useMutation({
    mutationFn: () => {
      const signatureDataUrl = padRef.current?.toDataUrl();
      if (!signatureDataUrl) {
        setPadError('Please draw your signature above');
        throw new Error('empty signature');
      }
      setPadError(null);
      return api.post(`/public/shortlists/${token}/documents/${documentId}/sign`, { signerName, signatureDataUrl });
    },
    onSuccess: onSigned,
  });

  return (
    <Modal open onClose={onClose} title={`Sign — ${documentName}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
        <p className="mb-4 text-xs text-muted">
          This records your agreement with a typed name and drawn signature. It isn't a notarized or legally-binding
          e-signature (like DocuSign) — just a simple, timestamped record that you reviewed and signed this document.
        </p>
        <Field label="Full name">
          <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
        </Field>
        <Field label="Signature">
          <SignaturePad ref={padRef} />
        </Field>
        {padError && <p className="mb-3 text-sm text-danger">{padError}</p>}
        {submit.isError && !padError && (
          <p className="mb-3 text-sm text-danger">
            {submit.error instanceof ApiError ? submit.error.message : 'Something went wrong — please try again.'}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => padRef.current?.clear()}>Clear</Button>
          <Button type="submit" disabled={submit.isPending || !signerName} className="flex-1">
            {submit.isPending ? 'Signing…' : 'Sign document'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PublicShortlist() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-shortlist', token],
    queryFn: () => api.get<PublicShortlistT>(`/public/shortlists/${token}`),
    retry: false,
  });
  const [viewingFor, setViewingFor] = useState<{ id: string; title: string } | null>(null);
  const [signing, setSigning] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground px-4">
        <div className="text-center">
          <h1 className="font-display text-xl font-semibold text-ink">Link not found</h1>
          <p className="mt-2 text-sm text-muted">This shortlist link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-white px-6 py-8 text-center sm:px-10">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{data.agencyName}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">{data.title}</h1>
        <p className="mt-1 text-sm text-muted">{data.items.length} {data.items.length === 1 ? 'property' : 'properties'} selected for you</p>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {data.items.length === 0 ? (
          <p className="text-center text-sm text-muted">No properties in this shortlist yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map(({ property, note }) => (
              <div key={property.id} className="overflow-hidden rounded-panel border border-line bg-white shadow-card">
                <div className="flex h-44 items-center justify-center bg-ground text-faint">
                  {property.images[0] ? (
                    <img src={property.images[0].url} alt={property.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs">No image</span>
                  )}
                </div>
                <div className="p-4">
                  <p className="mb-1 line-clamp-1 font-medium text-ink">{property.title}</p>
                  <p className="mb-2 text-xs text-muted">{property.location}</p>
                  <p className="mb-3 font-display text-lg font-semibold text-cypress-700">
                    {formatKes(property.price, { compact: true })}{property.listingType === 'RENT' ? '/mo' : ''}
                  </p>
                  <div className="mb-3 flex items-center gap-3 text-xs text-muted">
                    {property.bedrooms != null && <span className="flex items-center gap-1"><BedDouble size={13} /> {property.bedrooms}</span>}
                    {property.bathrooms != null && <span className="flex items-center gap-1"><Bath size={13} /> {property.bathrooms}</span>}
                  </div>
                  {note && <p className="mb-3 border-t border-line pt-3 text-sm italic text-muted">"{note}"</p>}
                  <button
                    onClick={() => setViewingFor({ id: property.id, title: property.title })}
                    className="flex w-full items-center justify-center gap-2 rounded-control border border-cypress-600 py-2 text-sm font-medium text-cypress-700 hover:bg-cypress-50"
                  >
                    <CalendarClock size={15} /> Request a viewing
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.documents.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Documents</h2>
            <div className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-white">
              {data.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 p-4">
                  <FileText size={18} className="shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{doc.name}</p>
                    {doc.signed && <p className="text-xs text-cypress-700">Signed {new Date(doc.signedAt!).toLocaleDateString('en-KE')}</p>}
                  </div>
                  <a
                    href={`/api/public/shortlists/${token}/documents/${doc.id}/file`}
                    target="_blank" rel="noreferrer"
                    className="shrink-0 text-xs font-medium text-cypress-700 hover:underline"
                  >
                    View
                  </a>
                  {doc.requiresSignature && !doc.signed && (
                    <button
                      onClick={() => setSigning({ id: doc.id, name: doc.name })}
                      className="flex shrink-0 items-center gap-1 rounded-control bg-cypress-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cypress-700"
                    >
                      <PenLine size={13} /> Sign
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {viewingFor && (
        <RequestViewingModal token={token!} propertyId={viewingFor.id} propertyTitle={viewingFor.title} onClose={() => setViewingFor(null)} />
      )}
      {signing && (
        <SignDocumentModal
          token={token!}
          documentId={signing.id}
          documentName={signing.name}
          onClose={() => setSigning(null)}
          onSigned={() => {
            setSigning(null);
            qc.invalidateQueries({ queryKey: ['public-shortlist', token] });
          }}
        />
      )}
    </div>
  );
}
