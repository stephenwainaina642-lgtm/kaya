import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Copy, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { aiErrorMessage } from './aiErrors';

interface DraftResult {
  subject: string | null;
  body: string;
}

export function DraftMessageModal({
  open, onClose, contactType, contactId, contactName,
}: { open: boolean; onClose: () => void; contactType: 'lead' | 'client'; contactId: string; contactName: string }) {
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [goal, setGoal] = useState('');
  const [copied, setCopied] = useState(false);

  const draft = useMutation({
    mutationFn: () => api.post<DraftResult>('/ai/draft-message', { contactType, contactId, channel, goal: goal || undefined }),
  });

  function copy() {
    if (!draft.data) return;
    const text = draft.data.subject ? `Subject: ${draft.data.subject}\n\n${draft.data.body}` : draft.data.body;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleClose() {
    draft.reset();
    setGoal('');
    setCopied(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Draft a message to ${contactName}`}>
      <div className="space-y-4">
        <Field label="Channel">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as 'whatsapp' | 'email')} disabled={draft.isPending}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </Select>
        </Field>
        <Field label="What's this message for? (optional)">
          <Input
            placeholder="e.g. follow up after the viewing, share a new listing"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={draft.isPending}
          />
        </Field>

        {draft.isError && <p className="text-sm text-danger">{aiErrorMessage(draft.error)}</p>}

        {draft.isPending ? (
          <div className="py-6"><Spinner /></div>
        ) : draft.data ? (
          <div className="rounded-control border border-line bg-ground p-4">
            {draft.data.subject && <p className="mb-2 text-sm font-semibold text-ink">{draft.data.subject}</p>}
            <p className="whitespace-pre-wrap text-sm text-ink">{draft.data.body}</p>
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2">
          <Button type="button" onClick={() => draft.mutate()} disabled={draft.isPending}>
            <Sparkles size={14} /> {draft.data ? 'Regenerate' : 'Generate draft'}
          </Button>
          {draft.data && (
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
        </div>
        <p className="text-xs text-faint">This is a draft — review and personalize it before sending.</p>
      </div>
    </Modal>
  );
}
