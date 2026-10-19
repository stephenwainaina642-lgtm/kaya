import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, MessageSquarePlus, Flame } from 'lucide-react';
import { api } from '../../lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DraftMessageModal } from './DraftMessageModal';
import { aiErrorMessage } from './aiErrors';

interface LeadScoreResult {
  temperature: 'HOT' | 'WARM' | 'COLD';
  reasoning: string;
}

const TEMP_TONE = { HOT: 'danger', WARM: 'warn', COLD: 'neutral' } as const;

export function AiInsightsCard({
  contactType, contactId, contactName,
}: { contactType: 'lead' | 'client'; contactId: string; contactName: string }) {
  const [showDraft, setShowDraft] = useState(false);

  const summarize = useMutation({
    mutationFn: () => api.post<{ summary: string }>('/ai/summarize', { contactType, contactId }),
  });

  const score = useMutation({
    mutationFn: () => api.post<LeadScoreResult>(`/ai/leads/${contactId}/score`),
  });

  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Sparkles size={18} className="text-brass" /> AI insights
      </h2>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => summarize.mutate()} disabled={summarize.isPending}>
          {summarize.isPending ? 'Summarizing…' : 'Summarize'}
        </Button>
        {contactType === 'lead' && (
          <Button type="button" variant="secondary" onClick={() => score.mutate()} disabled={score.isPending}>
            <Flame size={14} /> {score.isPending ? 'Scoring…' : 'Score lead'}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={() => setShowDraft(true)}>
          <MessageSquarePlus size={14} /> Draft message
        </Button>
      </div>

      {summarize.isError && <p className="mt-3 text-sm text-danger">{aiErrorMessage(summarize.error)}</p>}
      {summarize.data && <p className="mt-3 text-sm text-ink">{summarize.data.summary}</p>}

      {score.isError && <p className="mt-3 text-sm text-danger">{aiErrorMessage(score.error)}</p>}
      {score.data && (
        <div className="mt-3 flex items-start gap-2">
          <Badge tone={TEMP_TONE[score.data.temperature]}>{score.data.temperature}</Badge>
          <p className="text-sm text-muted">{score.data.reasoning}</p>
        </div>
      )}

      <DraftMessageModal
        open={showDraft}
        onClose={() => setShowDraft(false)}
        contactType={contactType}
        contactId={contactId}
        contactName={contactName}
      />
    </Card>
  );
}
