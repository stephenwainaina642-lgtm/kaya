import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Wallet } from 'lucide-react';
import type { CommissionListItem, CommissionPage } from '@kaya/shared';
import { formatKes, can } from '@kaya/shared';
import { useAuth } from '../../auth/AuthContext';
import { api, ApiError } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'> = {
  PENDING: 'warn', INVOICED: 'accent', PAID: 'ok', PARTIALLY_PAID: 'accent',
};

function RecordPaymentModal({ commission, onClose }: { commission: CommissionListItem; onClose: () => void }) {
  const qc = useQueryClient();
  const remaining = commission.amount - commission.paidAmount;
  const [amount, setAmount] = useState(remaining);

  const submit = useMutation({
    mutationFn: () => api.post(`/deals/commissions/${commission.id}/payments`, { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commissions'] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={`Record payment — ${commission.dealName}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
        <p className="mb-4 text-sm text-muted">
          Outstanding balance: <span className="font-medium text-ink">{formatKes(remaining)}</span>
        </p>
        <Field label="Amount paid (KES)">
          <Input
            type="number" min={0.01} max={remaining} step="0.01"
            value={amount} onChange={(e) => setAmount(Number(e.target.value))} required
          />
        </Field>
        {submit.isError && (
          <p className="mb-3 text-sm text-danger">
            {submit.error instanceof ApiError ? submit.error.message : 'Something went wrong — please try again.'}
          </p>
        )}
        <Button type="submit" disabled={submit.isPending || amount <= 0 || amount > remaining} className="w-full">
          {submit.isPending ? 'Recording…' : 'Record payment'}
        </Button>
      </form>
    </Modal>
  );
}

export function CommissionsList() {
  const { user } = useAuth();
  const [paying, setPaying] = useState<CommissionListItem | null>(null);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['commissions'],
    queryFn: () => api.get<CommissionPage>('/deals/commissions', { pageSize: 50 }),
    retry: false,
  });
  const canRecordPayment = !!user && can(user.role, 'commissions:edit');

  return (
    <>
      <PageHeader title="Commissions" />
      <div className="p-8">
        {data && (
          <div className="mb-6 grid grid-cols-2 gap-4">
            <Card className="p-4"><p className="text-xs text-muted">Outstanding</p><p className="font-display text-xl font-semibold text-ink">{formatKes(data.totalOutstanding, { compact: true })}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">Paid</p><p className="font-display text-xl font-semibold text-ink">{formatKes(data.totalPaid, { compact: true })}</p></Card>
          </div>
        )}
        {isError ? (
          <Card>
            <EmptyState
              icon={<Lock size={28} />}
              title="This feature isn't on your plan"
              body={error instanceof ApiError ? error.message : 'Ask your workspace admin to upgrade.'}
            />
          </Card>
        ) : isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Card><EmptyState title="No commissions yet" /></Card>
        ) : (
          <Card>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-5 py-3 font-medium">Deal</th>
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Paid</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-sunk">
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{c.dealName}</p>
                      <p className="text-xs text-muted">{c.dealNumber}</p>
                    </td>
                    <td className="px-5 py-3 text-muted">{c.agent.name}</td>
                    <td className="px-5 py-3 text-ink">{formatKes(c.amount, { compact: true })}</td>
                    <td className="px-5 py-3 text-muted">{formatKes(c.paidAmount, { compact: true })}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status.replace(/_/g, ' ')}</Badge></td>
                    <td className="px-5 py-3 text-right">
                      {canRecordPayment && c.status !== 'PAID' && (
                        <Button variant="ghost" onClick={() => setPaying(c)}>
                          <Wallet size={14} /> Record payment
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        )}
      </div>
      {paying && <RecordPaymentModal commission={paying} onClose={() => setPaying(null)} />}
    </>
  );
}
