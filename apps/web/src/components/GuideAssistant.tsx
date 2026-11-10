import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, X, ArrowRight, ArrowLeft, Send, Compass } from 'lucide-react';
import { guideAreasFor, type GuideAnswer } from '@kaya/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

const SEEN_KEY = 'kaya.guide.seen';
const store = {
  get: () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } },
  set: () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: the nudge may show again, harmless */ } },
};

const SUGGESTIONS = [
  'How do I advertise a property?',
  'How do I collect rent from tenants?',
  'I manage a big apartment block',
  'How do I invite my caretaker?',
];

type Turn = { from: 'me'; text: string } | { from: 'guide'; answer: GuideAnswer } | { from: 'error'; text: string };

/** Lights up the sidebar entry for the area being explained, and clears it again. */
function useSidebarGlow(path: string | null) {
  useEffect(() => {
    if (!path) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-nav="${CSS.escape(path)}"]`));
    els.forEach((el) => { el.classList.add('tour-glow'); el.scrollIntoView({ block: 'nearest' }); });
    return () => els.forEach((el) => el.classList.remove('tour-glow'));
  }, [path]);
}

export function GuideAssistant() {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const areas = useMemo(() => (user ? guideAreasFor(user.role, user.plan, null) : []), [user]);
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [nudge, setNudge] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // A gentle, one-time nudge for new people. Never reopens once dismissed or used.
  useEffect(() => {
    if (store.get()) return;
    const t = setTimeout(() => setNudge(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const ask = useMutation({
    mutationFn: (question: string) => api.post<GuideAnswer>('/guide/ask', { question }),
    onSuccess: (answer) => setTurns((t) => [...t, { from: 'guide', answer }]),
    onError: (err) => setTurns((t) => [...t, { from: 'error', text: err instanceof ApiError ? err.message : 'I could not reach the guide just now. Try again in a moment.' }]),
  });

  const current = tour !== null ? areas[tour] : null;
  useSidebarGlow(current?.to ?? null);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [turns, ask.isPending]);
  useEffect(() => { if (open && tour === null) input.current?.focus(); }, [open, tour]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) { setOpen(false); setTour(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user || areas.length === 0) return null;

  const openPanel = () => { setOpen(true); setNudge(false); store.set(); };
  const startTour = () => { setTour(0); setOpen(true); setNudge(false); store.set(); nav(areas[0]!.to); };
  const goTo = (i: number) => { setTour(i); nav(areas[i]!.to); };
  const endTour = () => { setTour(null); };
  const submit = (text: string) => {
    const question = text.trim();
    if (question.length < 2 || ask.isPending) return;
    setTurns((t) => [...t, { from: 'me', text: question }]);
    setQ('');
    ask.mutate(question);
  };

  return (
    <div className="print:hidden">
      {!open && (
        <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2">
          {nudge && (
            <div className="max-w-[16rem] rounded-panel border border-line bg-white p-3 pr-8 text-sm text-ink shadow-lift" role="status">
              <button type="button" aria-label="Dismiss" onClick={() => { setNudge(false); store.set(); }} className="absolute right-2 top-2 text-faint hover:text-ink"><X size={14} /></button>
              New here? Take a one-minute tour of Kaya.
              <button type="button" onClick={startTour} className="mt-2 block font-medium text-accent hover:underline">Start the tour</button>
            </div>
          )}
          <button type="button" onClick={openPanel} aria-label="Open the Kaya guide"
            className="flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-white shadow-lift transition-transform hover:-translate-y-0.5">
            <Sparkles size={16} /> Guide
          </button>
        </div>
      )}

      {open && (
        <section role="dialog" aria-label="Kaya guide"
          className="fixed bottom-5 right-5 z-30 flex max-h-[min(34rem,calc(100vh-2.5rem))] w-[calc(100vw-2.5rem)] max-w-[24rem] flex-col overflow-hidden rounded-panel border border-line bg-white shadow-lift">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles size={15} /> Kaya guide</p>
            <button type="button" aria-label="Close the guide" onClick={() => { setOpen(false); setTour(null); }} className="rounded-control p-1 text-muted hover:bg-sunk hover:text-ink"><X size={16} /></button>
          </header>

          {current ? (
            <div className="flex flex-1 flex-col p-5">
              <p className="text-xs text-faint">Step {tour! + 1} of {areas.length}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full bg-ink transition-all" style={{ width: `${((tour! + 1) / areas.length) * 100}%` }} /></div>
              <h2 className="mt-4 text-lg font-semibold text-ink">{current.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{current.summary}</p>
              <p className="mt-3 rounded-control bg-sunk px-3 py-2 text-sm text-ink"><span className="font-medium">Try this:</span> {current.tryThis}</p>
              <div className="mt-5 flex items-center justify-between">
                <button type="button" onClick={endTour} className="text-sm text-muted hover:text-ink">Skip tour</button>
                <div className="flex gap-2">
                  <button type="button" disabled={tour === 0} onClick={() => goTo(tour! - 1)} aria-label="Previous"
                    className="rounded-control border border-line p-2 text-ink hover:bg-sunk disabled:opacity-40"><ArrowLeft size={15} /></button>
                  {tour! < areas.length - 1 ? (
                    <button type="button" onClick={() => goTo(tour! + 1)} className="flex items-center gap-1.5 rounded-control bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black">Next <ArrowRight size={14} /></button>
                  ) : (
                    <button type="button" onClick={endTour} className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black">Finish</button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div ref={scroller} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                <p className="text-sm leading-relaxed text-ink">Hi {user.name.split(' ')[0]}. Ask me how to do anything in Kaya, or let me walk you around.</p>
                <button type="button" onClick={startTour} className="flex w-full items-center justify-between rounded-control border border-line px-3 py-2.5 text-left text-sm text-ink hover:bg-sunk">
                  <span className="flex items-center gap-2"><Compass size={15} /> Take the tour <span className="text-faint">({areas.length} areas)</span></span><ArrowRight size={14} />
                </button>
                {turns.length === 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:border-ink hover:text-ink">{s}</button>
                    ))}
                  </div>
                )}
                {turns.map((t, i) => t.from === 'me' ? (
                  <p key={i} className="ml-8 rounded-panel bg-ink px-3 py-2 text-sm text-white">{t.text}</p>
                ) : t.from === 'error' ? (
                  <p key={i} className="rounded-panel bg-[#fbeeee] px-3 py-2 text-sm text-danger" role="alert">{t.text}</p>
                ) : (
                  <div key={i} className="mr-4 rounded-panel bg-sunk px-3 py-2.5 text-sm text-ink">
                    <p className="leading-relaxed">{t.answer.answer}</p>
                    {t.answer.links.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {t.answer.links.map((l) => (
                          <button key={l.to} type="button" onClick={() => nav(l.to)}
                            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${loc.pathname === l.to ? 'border-line text-faint' : 'border-ink text-ink hover:bg-white'}`}>
                            {loc.pathname === l.to ? 'You are here: ' : 'Open '}{l.title} {loc.pathname !== l.to && <ArrowRight size={11} />}
                          </button>
                        ))}
                      </div>
                    )}
                    {!t.answer.ai && <p className="mt-2 text-[0.7rem] text-faint">Built-in guide</p>}
                  </div>
                ))}
                {ask.isPending && <p className="text-sm text-faint" role="status">Thinking…</p>}
              </div>
              <form className="flex items-center gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); submit(q); }}>
                <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} placeholder="Ask how to do something…" aria-label="Ask the Kaya guide"
                  className="min-w-0 flex-1 rounded-control border border-line px-3 py-2 text-sm text-ink" />
                <button type="submit" aria-label="Send" disabled={q.trim().length < 2 || ask.isPending} className="rounded-control bg-ink p-2.5 text-white hover:bg-black disabled:opacity-40"><Send size={15} /></button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}
