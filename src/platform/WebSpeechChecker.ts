import { words } from '@domain/speech/normalize';
import type { ListenOptions, ListenResult, ListenStatus, PronunciationChecker } from '@domain/speech/PronunciationChecker';

interface Alternative { transcript: string; confidence: number }
interface Result { length: number; isFinal: boolean; [i: number]: Alternative }
interface RecognitionEvent { resultIndex: number; results: { length: number; [i: number]: Result } }
interface Recognizer {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognizerCtor = new () => Recognizer;

const ERROR_STATUS: Readonly<Record<string, ListenStatus>> = {
  'not-allowed': 'denied', 'service-not-allowed': 'denied', 'no-speech': 'silence', aborted: 'silence',
};

/** Pause after a clip ends before opening the mic: iOS 27 recognition hangs if started during playback teardown. */
const AFTER_AUDIO_MS = 300;
/** Sentence mode: stop listening this long after the last word arrives. */
const SENTENCE_QUIET_MS = 1800;

/**
 * Free speech recognition (Safari/Chrome Web Speech API). A fresh recognizer per attempt and
 * a watchdog on every call, because iOS can silently never answer. 'hung' lets MicHealth switch
 * the session to Grown-up check instead of leaving a six-year-old staring at a frozen mic.
 */
export class WebSpeechChecker implements PronunciationChecker {
  private readonly Ctor: RecognizerCtor | undefined;
  private active: Recognizer | null = null;
  private generation = 0;

  constructor() {
    const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
    this.Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  get available(): boolean { return !!this.Ctor; }

  cancel(): void {
    this.generation++;
    try { this.active?.abort(); } catch { /* not started */ }
    this.active = null;
  }

  async listen({ expected, mode, timeoutMs }: ListenOptions): Promise<ListenResult> {
    const t0 = performance.now();
    if (!this.Ctor) return { status: 'unavailable', alternatives: [], ms: 0 };
    this.cancel();
    const generation = this.generation;
    await new Promise((r) => setTimeout(r, AFTER_AUDIO_MS));
    if (generation !== this.generation) return { status: 'silence', alternatives: [], ms: performance.now() - t0 };
    const limit = timeoutMs ?? (mode === 'word' ? 7000 : 15000);
    const target = words(expected);

    return new Promise<ListenResult>((resolve) => {
      const r = new (this.Ctor as RecognizerCtor)();
      this.active = r;
      r.lang = 'en-US';
      r.continuous = mode === 'sentence';
      r.interimResults = mode === 'sentence';
      r.maxAlternatives = mode === 'word' ? 5 : 3;

      let settled = false;
      let heardSomething = false;
      let finals: string[][] = [];
      let interim: string[] = [];
      let quiet: ReturnType<typeof setTimeout> | undefined;

      const collect = (): string[] => {
        const maxAlt = Math.max(1, ...finals.map((f) => f.length), interim.length);
        const alts: string[] = [];
        for (let a = 0; a < maxAlt; a++) {
          const parts = finals.map((f) => f[a] ?? f[0] ?? '');
          if (interim.length) parts.push(interim[a] ?? interim[0] ?? '');
          const text = parts.join(' ').trim();
          if (text && !alts.includes(text)) alts.push(text);
        }
        return alts;
      };

      const finish = (status: ListenStatus, error?: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        clearTimeout(quiet);
        try { r.abort(); } catch { /* ended */ }
        if (this.active === r) this.active = null;
        const alternatives = collect();
        const final: ListenStatus = status === 'silence' && alternatives.length ? 'heard' : status;
        resolve({ status: final, alternatives, ms: Math.round(performance.now() - t0), error });
      };

      // Hung = the recognizer never produced anything nor ended. A normal end always comes first.
      const watchdog = setTimeout(() => finish(heardSomething ? 'heard' : 'hung'), limit);

      r.onresult = (e) => {
        heardSomething = true;
        finals = [];
        interim = [];
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          const alts: string[] = [];
          for (let j = 0; j < res.length; j++) { const a = res[j]; if (a) alts.push(a.transcript.trim()); }
          if (res.isFinal) finals.push(alts); else interim = alts;
        }
        if (mode === 'word') { if (finals.length) finish('heard'); return; }
        // Sentence: stop early once every word has been heard, else after a quiet gap.
        const heard = new Set(words(collect()[0] ?? ''));
        if (target.length && target.every((t) => heard.has(t))) { finish('heard'); return; }
        clearTimeout(quiet);
        quiet = setTimeout(() => finish('heard'), SENTENCE_QUIET_MS);
      };
      r.onerror = (e) => finish(ERROR_STATUS[e.error] ?? 'error', e.error);
      r.onend = () => finish(heardSomething ? 'heard' : 'silence');
      try { r.start(); } catch (err) { finish('error', String(err)); }
    });
  }
}
