import type { AudioPort } from '@domain/audio/AudioPort';
import type { Clip } from '@domain/audio/AudioCatalog';
import { wordAtChar, wordStartTimes } from '@domain/audio/followTiming';
import type { AudioEngine } from './AudioEngine';

interface VoiceBank { label: string; catalog: Clip[]; available: Set<string> }

/**
 * Web Audio playback of the generated MP3s, cached after first decode. A clip without an MP3
 * (no Fish key yet, or a new word) is spoken by the device voice from the catalog text.
 */
export class WebAudioPlayer implements AudioPort {
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private current: AudioBufferSourceNode | null = null;
  private readonly clips: Map<string, Clip>;
  private readonly bankClips = new Map<string, Map<string, Clip>>();
  /** Bumped whenever the current clip is halted (including by the next play()). */
  private stopped = 0;
  private voiceId = 'teacher';
  /** Bumped only by stop() from outside: ends a sequence(); a play() inside it must not. */
  private cancelled = 0;
  private followTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly engine: AudioEngine,
    catalog: Clip[],
    private readonly available: Set<string>,
    private readonly base = import.meta.env.BASE_URL,
    private readonly banks: Record<string, VoiceBank> = {},
  ) {
    this.clips = new Map(catalog.map((c) => [c.key, c]));
    for (const [id, bank] of Object.entries(banks)) this.bankClips.set(id, new Map(bank.catalog.map((c) => [c.key, c])));
  }

  voices(): { id: string; label: string }[] {
    const installed = typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
    return [{ id: 'teacher', label: 'Teacher — Fish Audio' }, ...Object.entries(this.banks).map(([id, bank]) => ({ id, label: bank.label })), ...installed.filter((v) => /^en[-_]/i.test(v.lang)).map((v) => ({ id: `device:${v.voiceURI}`, label: `${v.name} (${v.lang}) — device` }))];
  }

  selectVoice(id: string): void { if (id !== this.voiceId) { this.stop(); this.voiceId = id; } }

  private deviceVoice(): SpeechSynthesisVoice | undefined {
    return typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis.getVoices().find((v) => `device:${v.voiceURI}` === this.voiceId && /^en[-_]/i.test(v.lang));
  }

  has(key: string): boolean { return !this.deviceVoice() && (this.banks[this.voiceId]?.available ?? this.available).has(key); }

  async unlock(): Promise<void> {
    await this.engine.unlock();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices();
  }

  async play(key: string, opts: { rate?: number } = {}): Promise<void> {
    this.halt();
    const token = this.stopped;
    const clip = this.clip(key);
    const buffer = this.has(key) ? await this.load(key) : null;
    if (token !== this.stopped) return; // stopped while loading
    if (buffer) { await this.startBuffer(buffer, opts.rate ?? 1); return; }
    await this.speak(clip?.text ?? key.split(':').pop() ?? '', (clip?.speed ?? 0.9) * (opts.rate ?? 1));
  }

  /** Starts a decoded clip without stopping anything (callers stop first). */
  private async startBuffer(buffer: AudioBuffer, rate: number): Promise<void> {
    const token = this.stopped;
    let mine: AudioBufferSourceNode | null = null;
    await this.engine.play(buffer, rate, (src) => { mine = src; this.current = src; }, () => token === this.stopped);
    if (this.current === mine) this.current = null;
  }

  async sequence(keys: string[], gapMs = 250): Promise<void> {
    const run = this.cancelled;
    for (const k of keys) {
      if (run !== this.cancelled) return;
      await this.play(k);
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  async follow(key: string, words: string[], onWord: (i: number) => void): Promise<void> {
    this.halt();
    const token = this.stopped;
    const clip = this.clip(key);
    const buffer = this.has(key) ? await this.load(key) : null;
    if (token !== this.stopped) return;
    if (buffer) {
      const done = this.startBuffer(buffer, 1);
      this.followTimers = wordStartTimes(words, buffer.duration * 1000).map((ms, i) => setTimeout(() => onWord(i), ms));
      await done;
      if (token === this.stopped) onWord(-1);
      return;
    }
    // Device voice: real word boundaries when the browser reports them, estimated otherwise.
    const text = clip?.text ?? words.join(' ');
    let gotBoundary = false;
    const estimate = wordStartTimes(words, words.length * 520).map((ms, i) => setTimeout(() => { if (!gotBoundary) onWord(i); }, ms));
    this.followTimers = estimate;
    await this.speak(text, clip?.speed ?? 0.8, (charIndex) => { gotBoundary = true; onWord(wordAtChar(words, charIndex)); });
    estimate.forEach((t) => clearTimeout(t));
    if (token === this.stopped) onWord(-1);
  }

  /** Stops whatever plays and ends any running sequence. */
  stop(): void {
    this.cancelled++;
    this.halt();
  }

  /** Stops the current clip only (play/follow call this before starting the next one). */
  private halt(): void {
    this.followTimers.forEach((t) => clearTimeout(t));
    this.followTimers = [];
    this.stopped++;
    try { this.current?.stop(); } catch { /* already ended */ }
    this.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  private clip(key: string): Clip | undefined { return (this.bankClips.get(this.voiceId) ?? this.clips).get(key); }

  private load(key: string): Promise<AudioBuffer | null> {
    const clip = this.clip(key);
    const cacheKey = clip?.file ?? key;
    let p = this.buffers.get(cacheKey);
    if (!p) {
      const ctx = this.engine.context;
      p = clip && ctx
        ? fetch(`${this.base}${clip.file}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((b) => ctx.decodeAudioData(b))
          .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(cacheKey, p);
      // Only successes are cached: a network blip or a call before unlock must not pin the clip to the device voice.
      void p.then((buffer) => { if (!buffer) this.buffers.delete(cacheKey); });
    }
    return p;
  }

  private speak(text: string, rate: number, onBoundary?: (charIndex: number) => void): Promise<void> {
    if (typeof speechSynthesis === 'undefined' || !text) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = rate;
      const voice = this.deviceVoice() ?? pickVoice();
      if (voice) u.voice = voice;
      const done = (): void => { clearTimeout(guard); resolve(); };
      // Safari sometimes never fires onend; don't let a session freeze on it.
      const guard = setTimeout(done, 1500 + text.length * 120);
      u.onend = done;
      u.onerror = done;
      if (onBoundary) u.onboundary = (e) => { if (e.name === 'word' || e.name === undefined) onBoundary(e.charIndex); };
      speechSynthesis.speak(u);
    });
  }
}

let cachedVoice: SpeechSynthesisVoice | null | undefined;
/** Prefer a natural US English voice when the device has one. */
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined && cachedVoice !== null) return cachedVoice;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang === 'en-US' || v.lang === 'en_US');
  const preferred = ['Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria', 'Nicky'];
  cachedVoice = preferred.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) ?? voices[0] ?? null;
  return cachedVoice;
}
