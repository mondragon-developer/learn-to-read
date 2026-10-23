import { clipKey } from '@domain/audio/AudioCatalog';
import type { Activity, Outcome, Source } from '@domain/storage/events';
import type { Profile } from '@domain/profiles/Profile';
import { MicHealth } from '@domain/speech/PronunciationChecker';
import prompts from '@data/prompts.json';
import type { AppContext } from '../context';
import { h, replace } from '../dom';
import { ReadAloud, type ReadState, type Voice } from './readAloud';
import { HOWTO, type HowToId } from './howto';

/** Activities that score a goal when not missed (a session summary or a story word is not a goal). */
const NOT_GOALS: ReadonlySet<Activity> = new Set(['session', 'story-read', 'soccer']);
const PROMPTS = prompts as Record<string, string>;

/**
 * What every activity in one session shares: audio cues, the read-aloud helper, event recording,
 * the goal counter, and the "how to play" intros + headers.
 */
export class Kit implements Voice {
  readonly reader: ReadAloud;
  readonly abort = new AbortController();
  get independent(): boolean { return this.profile.settings.checkMode === 'independent'; }
  private readonly shared: { goals: number; practiceCount: number; known: Set<string>; introduced: Set<HowToId>; parts: Kit[]; reading: ReadState; paused?: Promise<void>; resume?: () => void };
  private interruptedForPlay = false;
  /** Activities with durable local state (ink, a running clock) can retain it across play. */
  onPlayBreak?: () => () => void;
  get isPaused(): boolean { return !!this.shared.paused; }
  get goals(): number { return this.shared.goals; }
  /** Includes retries and unverified practice, independent of reading accuracy. */
  get practiceCount(): number { return this.shared.practiceCount; }
  /** Card ids already introduced to this child. */
  get known(): Set<string> { return this.shared.known; }
  set known(value: Set<string>) { this.shared.known = value; }
  readonly ctx: AppContext;
  private stopRecording: (() => void) | undefined;
  private stopNarration: (() => void) | undefined;
  /** Set when the child leaves mid-session: nothing more gets recorded. */
  closed = false;
  /** Position of the current step among steps of its kind ("2 of 3"), set by the session. */
  step: { n: number; of: number } | null = null;
  /** How the whole story is read the first time: natural pace (pointed) or word by word. */
  pace: 'word' | 'follow';


  constructor(
    private readonly raw: AppContext,
    readonly profile: Profile,
    readonly sessionId: string,
    private readonly onGoal: (goals: number) => void,
    parent?: Kit,
  ) {
    this.shared = parent?.shared ?? { goals: 0, practiceCount: 0, known: new Set(), introduced: new Set(), parts: [], reading: { health: new MicHealth(), recorderBroken: false, independent: { unavailable: false } } };
    // A skipped part owns its DOM and these guarded ports. Late results cannot speak,
    // start another recording or write an assessment into the next part.
    const audio = raw.audio;
    this.ctx = { ...raw,
      audio: {
        unlock: () => this.closed ? Promise.resolve() : audio.unlock(),
        play: async (...args) => { if (this.shared.paused) await this.shared.paused; if (!this.closed) await audio.play(...args); },
        follow: async (...args) => { if (this.shared.paused) await this.shared.paused; if (!this.closed) await audio.follow(...args); },
        sequence: async (...args) => { if (this.shared.paused) await this.shared.paused; if (!this.closed) await audio.sequence(...args); },
        stop: () => { if (!this.closed) audio.stop(); },
        has: (key) => audio.has(key),
      },
      checker: {
        get available() { return raw.checker.available; },
        listen: async (opts) => { this.abort.signal.throwIfAborted(); const result = await raw.checker.listen(opts); this.abort.signal.throwIfAborted(); return result; },
        cancel: () => { if (!this.closed) raw.checker.cancel(); },
      },
      recorder: {
        get available() { return raw.recorder.available; },
        record: async (ms) => {
          this.abort.signal.throwIfAborted();
          const result = await raw.recorder.record(ms);
          if (result.ok) {
            if (this.closed) result.recording.stop();
            else this.stopRecording = () => result.recording.stop();
          }
          this.abort.signal.throwIfAborted();
          return result;
        },
        play: async (take) => { this.abort.signal.throwIfAborted(); return raw.recorder.play(take); },
      },
    };
    const ctx = this.ctx;
    this.reader = new ReadAloud(this, ctx.checker, ctx.recorder, ctx.matcher, ctx.sentences, ctx.i18n, profile.settings.checkMode === 'mic' || this.independent, this.independent, this.abort.signal, () => { this.stopNarration?.(); ctx.audio.stop(); }, this.shared.reading);
    this.pace = profile.settings.readingPace ?? 'follow';
  }

  /** Run a skippable part in an isolated host; null means skipped, never incorrect. */
  async part<T>(host: HTMLElement, run: (kit: Kit, host: HTMLElement) => Promise<T>): Promise<T | null> {
    for (;;) {
      if (this.shared.paused) await this.shared.paused;
      if (this.closed) return null;
      const child = new Kit(this.raw, this.profile, this.sessionId, this.onGoal, this);
      child.step = this.step;
      child.pace = this.pace;
      const target = h('div', { class: 'activity-part' });
      replace(host, target);
      const cancel = (): void => child.cancel();
      this.abort.signal.addEventListener('abort', cancel, { once: true });
      this.shared.parts.push(child);
      const skipped = new Promise<null>((resolve) => child.abort.signal.addEventListener('abort', () => resolve(null), { once: true }));
      let result: T | null;
      try {
        result = await Promise.race([run(child, target).catch((error: unknown) => {
          if (child.closed) return null;
          throw error;
        }), skipped]);
      } finally {
        child.cancel();
        this.abort.signal.removeEventListener('abort', cancel);
        const index = this.shared.parts.indexOf(child);
        if (index >= 0) this.shared.parts.splice(index, 1);
      }
      // Restart only the interrupted leaf (e.g. this sentence), never completed steps.
      if (!child.interruptedForPlay || this.closed) return result;
    }
  }

  pause(): () => void {
    if (this.closed || this.shared.paused) return () => undefined;
    this.shared.paused = new Promise<void>((resolve) => { this.shared.resume = resolve; });
    const leaf = this.shared.parts.at(-1);
    const restore = leaf?.onPlayBreak?.();
    if (leaf && !restore) { leaf.interruptedForPlay = true; leaf.cancel(); }
    this.raw.audio.stop(); this.raw.checker.cancel(); this.raw.recorder.stop?.();
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      const resume = this.shared.resume;
      this.shared.paused = undefined; this.shared.resume = undefined;
      if (!leaf?.closed) restore?.();
      resume?.();
    };
  }

  skipPart(): void { this.shared.parts.at(-1)?.cancel(); }
  skipSection(): void { this.shared.parts[0]?.cancel(); }

  /** A narration scope can be stopped without skipping or grading the child's activity. */
  narrate(run: (voice: Kit) => Promise<void>): () => void {
    this.stopNarration?.();
    const voice = new Kit(this.raw, this.profile, this.sessionId, this.onGoal, this);
    const stop = (): void => {
      voice.cancel();
      this.abort.signal.removeEventListener('abort', stop);
      if (this.stopNarration === stop) this.stopNarration = undefined;
    };
    if (this.closed) { stop(); return stop; }
    this.stopNarration = stop;
    this.abort.signal.addEventListener('abort', stop, { once: true });
    void run(voice).catch((error: unknown) => { if (!voice.closed) console.error('narration failed', error); });
    return stop;
  }

  /** Answers are live immediately; taking a turn cancels the remaining narration queue. */
  async respond<T>(playback: (voice: Kit) => Promise<void>, response: Promise<T>): Promise<T> {
    const stop = this.narrate(playback);
    try { return await response; } finally { this.stopNarration?.(); stop(); }
  }

  /** Optional demonstration. Taking a turn is not a skip and never awards a reading pass. */
  async model(host: HTMLElement, playback: (voice: Kit) => Promise<void>, label = 'My turn!'): Promise<void> {
    await this.part(host, async (voice, target) => {
      replace(target, h('p', { class: 'coach small' }, 'Listen, or take your turn when you’re ready.'),
        h('button', { class: 'btn big ok my-turn', onClick: () => voice.cancel() }, `▶ ${label}`));
      await playback(voice);
    });
  }

  async feedback(host: HTMLElement, playback: (voice: Kit) => Promise<void>): Promise<void> {
    const footer = h('div', { class: 'practice-feedback' });
    (host.querySelector('.stage') ?? host).appendChild(footer);
    try { await this.model(footer, playback, 'Next!'); } finally { footer.remove(); }
  }

  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopNarration?.();
    this.abort.abort();
    this.stopRecording?.();
    this.raw.recorder.stop?.();
    this.raw.audio.stop();
    this.raw.checker.cancel();
  }

  get grownUpMode(): boolean { return this.reader.grownUpMode; }

  say(key: string): Promise<void> { return this.ctx.audio.play(key); }
  prompt(id: string): Promise<void> { return this.ctx.audio.play(clipKey.prompt(id)); }
  word(text: string): Promise<void> { return this.ctx.audio.play(clipKey.word(text)); }
  follow(key: string, words: string[], onWord: (i: number) => void): Promise<void> { return this.ctx.audio.follow(key, words, onWord); }

  async record(activity: Activity, itemId: string, outcome: Outcome, source: Source, meta?: Record<string, string | number | boolean>): Promise<void> {
    if (this.shared.paused) await this.shared.paused;
    if (this.closed) return;
    await this.ctx.log.record({ profileId: this.profile.id, activity, itemId, outcome, source, meta: { session: this.sessionId, ...meta } });
    if (activity !== 'session' && activity !== 'soccer') this.shared.practiceCount++;
    if ((outcome === 'first-try' || outcome === 'after-retry') && !NOT_GOALS.has(activity)) this.goal();
  }

  goal(): void {
    this.shared.goals++;
    this.onGoal(this.goals);
  }

  /**
   * "How to play" card, the first time an activity appears in this session: the child hears what
   * to do, the grown-up reads their part (in the parent's language), then taps Let's go.
   */
  async intro(host: HTMLElement, id: HowToId): Promise<void> {
    if (this.shared.introduced.has(id) || this.closed) return;
    await this.part(host, (kit, target) => kit.showIntro(target, id));
  }

  private async showIntro(host: HTMLElement, id: HowToId): Promise<void> {
    if (this.shared.introduced.has(id) || this.closed) return;
    this.shared.introduced.add(id);
    const { icon, title } = HOWTO[id];
    const prompt = this.instruction(id);
    const go = h('button', { class: 'btn big ok' }, '▶ Let’s go!'); // child-facing: always English
    replace(host, h('div', { class: 'stage center howto' },
      h('div', { class: 'howto-icon', 'aria-hidden': 'true' }, icon),
      h('h2', {}, title),
      h('p', { class: 'howto-child' }, PROMPTS[prompt] ?? ''),
      this.independent || (id === 'story' && this.profile.settings.storyReading !== 'coach') ? null : this.grownUpNote(id),
      h('div', { class: 'row center' }, h('button', { class: 'btn soft', onClick: () => void this.prompt(prompt) }, '🔊 Again'), go)));
    const tapped = new Promise<void>((resolve) => go.addEventListener('click', () => resolve(), { once: true }));
    void this.prompt(prompt).then(() => { if (!this.closed && go.isConnected) return this.prompt('lets-go'); });
    await tapped;
    this.ctx.audio.stop();
  }

  /**
   * Activity title with the session counter ("New word 2 of 3") and a ? button that repeats the
   * instructions. A custom label carries its own counter unless withStep is passed.
   */
  header(id: HowToId, label?: string, withStep = label === undefined): HTMLElement {
    const { icon, title } = HOWTO[id];
    const counter = withStep && this.step && this.step.of > 1 ? ` ${this.step.n} of ${this.step.of}` : '';
    const help = h('button', { class: 'help-btn', 'aria-label': 'How to play', onClick: () => {
      const prompt = this.instruction(id);
      void this.prompt(prompt);
      const pop = h('div', { class: 'howto-pop', role: 'dialog' },
        h('p', { class: 'howto-child' }, PROMPTS[prompt] ?? ''), this.independent || (id === 'story' && this.profile.settings.storyReading !== 'coach') ? null : this.grownUpNote(id),
        h('button', { class: 'btn small', onClick: () => { pop.remove(); this.ctx.audio.stop(); } }, '✓ OK'));
      document.body.appendChild(pop);
      this.abort.signal.addEventListener('abort', () => pop.remove(), { once: true });
    } }, '?');
    return h('div', { class: 'stage-head' }, h('div', { class: 'tag' }, `${icon} ${label ?? title}${counter}`), help);
  }

  private instruction(id: HowToId): string {
    if (id === 'story' && this.profile.settings.storyReading !== 'coach') return 'howto-story-simple';
    return `howto-${id}${this.independent && (id === 'sentence' || id === 'story') ? '-independent' : ''}`;
  }

  private grownUpNote(id: HowToId): HTMLElement {
    const t = this.ctx.i18n;
    return h('div', { class: 'grownup-note', lang: t.locale }, h('b', {}, `👪 ${t.t('howto.grownup')}: `), t.t(`howto.${id}`));
  }
}
