import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Upload } from 'lucide-react';
import { can } from '@kaya/shared';
import type { DocumentPage } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { UploadDocumentForm } from '../../forms/UploadDocumentForm';

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsList() {
  const { user } = useAuth();
  const [showUpload, setShowUpload] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<DocumentPage>('/documents', { pageSize: 50 }),
  });

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle={data ? `${data.total} files` : undefined}
        actions={
          user && can(user.role, 'documents:edit') ? (
            <Button onClick={() => setShowUpload(true)}><Upload size={16} /> Upload document</Button>
          ) : undefined
        }
      />
      <div className="p-8">
        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState icon={<FileText size={28} />} title="No documents uploaded" /></Card>
        ) : (
          <Card>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Size</th>
                  <th className="px-5 py-3 font-medium">Uploaded by</th>
                  <th className="px-5 py-3 font-medium">Signature</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-5 py-3 font-medium text-ink">{d.name}</td>
                    <td className="px-5 py-3"><Badge>{d.type.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-5 py-3 text-muted">{formatBytes(d.sizeBytes)}</td>
                    <td className="px-5 py-3 text-muted">{d.uploadedBy?.name ?? '—'}</td>
                    <td className="px-5 py-3">
                      {!d.requiresSignature ? (
                        <span className="text-faint">—</span>
                      ) : d.signed ? (
                        <Badge tone="ok">Signed</Badge>
                      ) : (
                        <Badge tone="warn">Awaiting signature</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <a href={`/api/documents/${d.id}/download`} className="inline-flex items-center gap-1 text-cypress-700 hover:underline">
                        <Download size={14} /> Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}
      </div>
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload document">
        <UploadDocumentForm onDone={() => setShowUpload(false)} />
      </Modal>
    </>
  );
}
