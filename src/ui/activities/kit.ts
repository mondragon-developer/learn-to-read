import { clipKey } from '@domain/audio/AudioCatalog';
import type { Activity, Outcome, Source } from '@domain/storage/events';
import type { Profile } from '@domain/profiles/Profile';
import prompts from '@data/prompts.json';
import type { AppContext } from '../context';
import { h, replace } from '../dom';
import { ReadAloud, type Voice } from './readAloud';
import { HOWTO, type HowToId } from './howto';

/** Activities that score a goal when not missed (a session summary or a story word is not a goal). */
const NOT_GOALS: ReadonlySet<Activity> = new Set(['session', 'story-read']);
const PROMPTS = prompts as Record<string, string>;

/**
 * What every activity in one session shares: audio cues, the read-aloud helper, event recording,
 * the goal counter, and the "how to play" intros + headers.
 */
export class Kit implements Voice {
  readonly reader: ReadAloud;
  readonly abort = new AbortController();
  get independent(): boolean { return this.profile.settings.checkMode === 'independent'; }
  goals = 0;
  /** Card ids already introduced to this child (set by the session from the deck). */
  known = new Set<string>();
  /** Set when the child leaves mid-session: nothing more gets recorded. */
  closed = false;
  /** Position of the current step among steps of its kind ("2 of 3"), set by the session. */
  step: { n: number; of: number } | null = null;
  /** How the whole story is read the first time: natural pace (pointed) or word by word. */
  pace: 'word' | 'follow';
  private readonly introduced = new Set<HowToId>();

  constructor(
    readonly ctx: AppContext,
    readonly profile: Profile,
    readonly sessionId: string,
    private readonly onGoal: (goals: number) => void,
  ) {
    this.reader = new ReadAloud(this, ctx.checker, ctx.recorder, ctx.matcher, ctx.sentences, ctx.i18n, profile.settings.checkMode === 'mic' || this.independent, this.independent, this.abort.signal, () => ctx.audio.stop());
    this.pace = profile.settings.readingPace ?? 'follow';
  }

  get grownUpMode(): boolean { return this.reader.grownUpMode; }

  say(key: string): Promise<void> { return this.ctx.audio.play(key); }
  prompt(id: string): Promise<void> { return this.ctx.audio.play(clipKey.prompt(id)); }
  word(text: string): Promise<void> { return this.ctx.audio.play(clipKey.word(text)); }
  follow(key: string, words: string[], onWord: (i: number) => void): Promise<void> { return this.ctx.audio.follow(key, words, onWord); }

  async record(activity: Activity, itemId: string, outcome: Outcome, source: Source, meta?: Record<string, string | number | boolean>): Promise<void> {
    if (this.closed) return;
    await this.ctx.log.record({ profileId: this.profile.id, activity, itemId, outcome, source, meta: { session: this.sessionId, ...meta } });
    if ((outcome === 'first-try' || outcome === 'after-retry') && !NOT_GOALS.has(activity)) this.goal();
  }

  goal(): void {
    this.goals++;
    this.onGoal(this.goals);
  }

  /**
   * "How to play" card, the first time an activity appears in this session: the child hears what
   * to do, the grown-up reads their part (in the parent's language), then taps Let's go.
   */
  async intro(host: HTMLElement, id: HowToId): Promise<void> {
    if (this.introduced.has(id) || this.closed) return;
    this.introduced.add(id);
    const { icon, title } = HOWTO[id];
    const prompt = this.instruction(id);
    const go = h('button', { class: 'btn big ok' }, '▶ Let’s go!'); // child-facing: always English
    replace(host, h('div', { class: 'stage center howto' },
      h('div', { class: 'howto-icon', 'aria-hidden': 'true' }, icon),
      h('h2', {}, title),
      h('p', { class: 'howto-child' }, PROMPTS[prompt] ?? ''),
      this.independent ? null : this.grownUpNote(id),
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
        h('p', { class: 'howto-child' }, PROMPTS[prompt] ?? ''), this.independent ? null : this.grownUpNote(id),
        h('button', { class: 'btn small', onClick: () => { pop.remove(); this.ctx.audio.stop(); } }, '✓ OK'));
      document.body.appendChild(pop);
    } }, '?');
    return h('div', { class: 'stage-head' }, h('div', { class: 'tag' }, `${icon} ${label ?? title}${counter}`), help);
  }

  private instruction(id: HowToId): string {
    return `howto-${id}${this.independent && (id === 'sentence' || id === 'story') ? '-independent' : ''}`;
  }

  private grownUpNote(id: HowToId): HTMLElement {
    const t = this.ctx.i18n;
    return h('div', { class: 'grownup-note', lang: t.locale }, h('b', {}, `👪 ${t.t('howto.grownup')}: `), t.t(`howto.${id}`));
  }
}
