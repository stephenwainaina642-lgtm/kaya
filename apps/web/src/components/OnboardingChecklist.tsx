import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, X, Sparkles } from 'lucide-react';
import type { OnboardingStatus, OnboardingStepKey } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Card } from './ui/Card';

const COPY: Record<OnboardingStepKey, { title: string; hint: string; to: string }> = {
  branding: { title: 'Make it yours', hint: 'Upload your logo or pick a brand color — it shows to your team and on client pages.', to: '/settings' },
  property: { title: 'Add your first property', hint: 'Start with one listing; matching and shortlists build on it.', to: '/properties' },
  lead: { title: 'Add your first lead', hint: 'Log an enquiry, or share your public inquiry form from Settings.', to: '/leads' },
  teammate: { title: 'Invite a teammate', hint: 'Agents, managers and viewers each get their own access level.', to: '/team' },
  viewing: { title: 'Schedule a viewing', hint: 'Book one against a lead and a property so it lands on the calendar.', to: '/viewings' },
};

/** Getting-started card for org admins. Hides itself once dismissed or fully done. */
export function OnboardingChecklist() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'ORG_ADMIN';
  const { data } = useQuery({
    queryKey: ['onboarding'],
    queryFn: () => api.get<OnboardingStatus>('/onboarding'),
    enabled: isAdmin,
  });
  const dismiss = useMutation({
    mutationFn: () => api.post<OnboardingStatus>('/onboarding/dismiss'),
    onSuccess: (next) => qc.setQueryData(['onboarding'], next),
  });

  const sample = useMutation({
    mutationFn: (load: boolean) =>
      load ? api.post<OnboardingStatus>('/onboarding/sample-data') : api.del<OnboardingStatus>('/onboarding/sample-data'),
    onSuccess: (next) => {
      qc.setQueryData(['onboarding'], next);
      // Lists everywhere may now contain or lack the demo records.
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'onboarding' });
    },
  });
  const sampleError = sample.error instanceof ApiError ? sample.error.message : sample.error ? 'Something went wrong' : null;

  if (!isAdmin || !data) return null;

  const banner = data.sampleLoaded && (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-sunk px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-ink">
        <Sparkles size={15} className="text-accent" />
        You're looking at sample data. Explore freely, then clear it when you're ready to add your own.
      </span>
      <span className="flex items-center gap-3">
        {sampleError && <span className="text-danger">{sampleError}</span>}
        <button
          onClick={() => sample.mutate(false)}
          disabled={sample.isPending}
          className="font-medium text-cypress-700 hover:underline disabled:opacity-50"
        >
          {sample.isPending ? 'Removing…' : 'Remove sample data'}
        </button>
      </span>
    </div>
  );

  if (data.dismissed || data.completed === data.total) return banner || null;

  return (
    <>
    {banner}
    <Card className="relative p-6">
      <button
        onClick={() => dismiss.mutate()}
        className="absolute right-3 top-3 rounded-control p-1.5 text-faint hover:bg-sunk hover:text-ink"
        title="Hide this checklist"
        aria-label="Hide this checklist"
      >
        <X size={16} />
      </button>
      <h2 className="mt-3 font-display text-lg font-semibold text-ink">Get your workspace set up</h2>
      <p className="mt-1 text-sm text-muted">{data.completed} of {data.total} done — a few quick steps to get value from Kaya.</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunk">
        <div className="h-full rounded-full bg-cypress-600 transition-all" style={{ width: `${(data.completed / data.total) * 100}%` }} />
      </div>
      <ul className="mt-4 divide-y divide-line">
        {data.steps.map((s) => {
          const c = COPY[s.key];
          return (
            <li key={s.key} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  s.done ? 'border-cypress-600 bg-cypress-600 text-white' : 'border-line bg-surface text-transparent'
                }`}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.done ? 'text-faint line-through' : 'text-ink'}`}>{c.title}</p>
                {!s.done && <p className="mt-0.5 text-sm text-muted">{c.hint}</p>}
              </div>
              {!s.done && (
                <Link to={c.to} className="shrink-0 text-sm font-medium text-cypress-700 hover:underline">Start</Link>
              )}
            </li>
          );
        })}
      </ul>
      {!data.sampleLoaded && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
          <span className="text-muted">Just exploring?</span>
          <button
            onClick={() => sample.mutate(true)}
            disabled={sample.isPending}
            className="font-medium text-cypress-700 hover:underline disabled:opacity-50"
          >
            {sample.isPending ? 'Loading…' : 'Load sample data'}
          </button>
          {sampleError && <span className="text-danger">{sampleError}</span>}
        </div>
      )}
    </Card>
    </>
  );
}
