import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Square } from 'lucide-react';

// The browser's built-in speech recognition (Chrome, Edge, Safari, Android). It is not in the TypeScript DOM lib.
interface Rec {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
type RecCtor = new () => Rec;
const ctor = (): RecCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const LOCALES: Record<string, string> = { en: 'en-KE', sw: 'sw-KE', fr: 'fr-FR' };

/**
 * "Speak instead of typing". Each finished phrase is handed to onText, which the form appends to its
 * text box so the person can still read and fix it before sending. Renders nothing where the browser
 * has no speech recognition, so it never shows a button that cannot work.
 */
export function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const { t, i18n } = useTranslation();
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => () => rec.current?.stop(), []);

  const Ctor = typeof window === 'undefined' ? null : ctor();
  if (!Ctor) return null;

  const toggle = () => {
    if (listening) { rec.current?.stop(); return; }
    setProblem(null);
    const r = new Ctor();
    r.lang = LOCALES[i18n.resolvedLanguage ?? 'en'] ?? 'en-KE';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) { const text = res[0]!.transcript.trim(); if (text) cb.current(text); }
      }
    };
    r.onerror = (e) => setProblem(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? t('voice.denied') : e.error === 'no-speech' ? t('voice.none') : t('voice.failed'));
    r.onend = () => setListening(false);
    rec.current = r;
    try { r.start(); setListening(true); } catch { setProblem(t('voice.failed')); }
  };

  return (
    <div className="mt-1.5">
      <button type="button" onClick={toggle} aria-pressed={listening}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${listening ? 'border-danger text-danger' : 'border-line text-muted hover:border-ink hover:text-ink'}`}>
        {listening ? <Square size={12} fill="currentColor" /> : <Mic size={13} />}
        {listening ? t('voice.stop') : t('voice.start')}
      </button>
      {listening && <span className="ml-2 text-xs text-faint" role="status">{t('voice.listening')}</span>}
      {problem && <p className="mt-1 text-xs text-danger" role="alert">{problem}</p>}
    </div>
  );
}
