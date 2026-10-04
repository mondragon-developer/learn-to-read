import type { ContentLibrary } from '../content/ContentLibrary';
import type { Story, StorySkill } from '../content/types';
import { dueCards, type DeckState } from '../srs/Leitner';
import type { PracticeEvent } from '../storage/events';

export type WarmupGame = 'rhyme' | 'blend' | 'syllables' | 'sound-it-out';
export type WritingMode = 'off' | 'trace' | 'tiles' | 'free';
export type SessionMinutes = 5 | 10 | 15;

export type Step =
  | { kind: 'warmup'; game: WarmupGame; unit: number }
  | { kind: 'review'; cardId: string }
  | { kind: 'new-word'; cardId: string }
  | { kind: 'write'; cardId: string; mode: Exclude<WritingMode, 'off'> }
  | { kind: 'sentence'; unit: number; index: number }
  | { kind: 'story'; storyId: string }
  | { kind: 'game'; game: 'tricky' | 'tiles'; unit: number };

export interface SessionSettings {
  minutes: SessionMinutes;
  writing: WritingMode;
  /** Units before this are treated as known (placement). */
  startUnit: number;
  /** One grade-level challenge word a day in 10/15-minute sessions (default on). */
  challenge?: boolean;
}

export interface SessionPlan {
  steps: Step[];
  unit: number;
  estimatedSeconds: number;
}

/** Rough seconds per step for a six-year-old, used to fit the parent's 5/10/15 choice. */
export const STEP_SECONDS: Readonly<Record<Step['kind'], number>> = {
  warmup: 60, review: 15, 'new-word': 35, write: 30, sentence: 75, story: 480, game: 90,
};

const CORE_SECONDS = 300;
const NEW_PER_DAY = 3;
/** Heavy review load means fewer new words: consolidation beats coverage. */
const DUE_SOME_NEW = 12;
const DUE_NO_NEW = 20;
const STRUGGLING_BOX1 = 8;
/** i-Ready asked for rhyme and onset-rime blending first, so they come up twice as often. */
const WARMUP_ROTATION: readonly WarmupGame[] = ['rhyme', 'blend', 'sound-it-out', 'rhyme', 'syllables', 'blend'];
/** Skills he missed in homework get a nudge when choosing a story to repeat. */
const FOCUS_SKILLS: ReadonlySet<StorySkill> = new Set(['compare', 'time-words']);

export interface PlannerInput {
  library: ContentLibrary;
  deck: DeckState;
  events: PracticeEvent[];
  today: number;
  settings: SessionSettings;
}

export class SessionPlanner {
  /** The unit being taught: first unit (from placement) that still has words never introduced. */
  currentUnit(library: ContentLibrary, deck: DeckState, startUnit: number): number {
    for (const u of library.units) {
      if (u.order < startUnit) continue;
      if (library.unitCards(u.order).some((c) => !deck.has(c.id))) return u.order;
    }
    return Math.max(startUnit, library.lastUnit());
  }

  plan(input: PlannerInput): SessionPlan {
    const { library, deck, events, today, settings } = input;
    const unit = this.currentUnit(library, deck, settings.startUnit);
    const steps: Step[] = [];

    steps.push({ kind: 'warmup', game: WARMUP_ROTATION[today % WARMUP_ROTATION.length] as WarmupGame, unit });

    const newCards = this.pickNew(input, unit);
    const writeMode = settings.writing === 'off' ? null : settings.writing;
    const fixed = STEP_SECONDS.warmup + newCards.length * STEP_SECONDS['new-word']
      + (writeMode && newCards.length ? STEP_SECONDS.write : 0) + STEP_SECONDS.sentence;
    const reviewSlots = Math.max(2, Math.floor((CORE_SECONDS - fixed) / STEP_SECONDS.review));
    const reviewedToday = new Set(events.filter((e) => e.day === today && e.activity === 'review').map((e) => e.itemId));
    const reviews = dueCards(deck, today).filter((c) => !reviewedToday.has(c.id)).slice(0, reviewSlots);

    // Review first (warm memory), then new words, then use them in a sentence.
    for (const c of reviews) steps.push({ kind: 'review', cardId: c.id });
    for (const id of newCards) steps.push({ kind: 'new-word', cardId: id });
    const firstNew = newCards[0];
    if (writeMode && firstNew) steps.push({ kind: 'write', cardId: firstNew, mode: writeMode });
    const u = library.unit(unit);
    if (u && u.sentences.length) steps.push({ kind: 'sentence', unit, index: today % u.sentences.length });

    if (settings.minutes >= 10 && settings.challenge !== false) {
      const id = this.pickChallenge(input);
      if (id) steps.push({ kind: 'new-word', cardId: id });
    }
    if (settings.minutes >= 10) {
      const story = this.pickStory(library, events, unit);
      if (story) steps.push({ kind: 'story', storyId: story.id });
    }
    if (settings.minutes >= 15) {
      steps.push({ kind: 'game', game: 'tricky', unit });
      steps.push({ kind: 'game', game: 'tiles', unit });
    }
    return { steps, unit, estimatedSeconds: steps.reduce((s, x) => s + STEP_SECONDS[x.kind], 0) };
  }

  /** "Extra time": more reps of young words (no promotion unless due) plus a game. */
  planExtra(input: PlannerInput): SessionPlan {
    const { library, deck, today, settings } = input;
    const unit = this.currentUnit(library, deck, settings.startUnit);
    const young = [...deck.values()]
      .filter((c) => c.box <= 3)
      .sort((a, b) => a.box - b.box || b.misses - a.misses || a.id.localeCompare(b.id))
      .slice(0, 6);
    const steps: Step[] = young.map((c) => ({ kind: 'review', cardId: c.id }));
    steps.push({ kind: 'game', game: today % 2 === 0 ? 'tricky' : 'tiles', unit });
    return { steps, unit, estimatedSeconds: steps.reduce((s, x) => s + STEP_SECONDS[x.kind], 0) };
  }

  private pickNew(input: PlannerInput, unit: number): string[] {
    const { library, deck, events, today } = input;
    const challenge = new Set(library.challengeOrder);
    const introducedToday = events.filter((e) => e.day === today && e.activity === 'new-word' && !challenge.has(e.itemId)).length;
    const due = dueCards(deck, today).length;
    const box1 = [...deck.values()].filter((c) => c.box === 1).length;
    let count = NEW_PER_DAY;
    if (due > DUE_NO_NEW) count = 0;
    else if (due > DUE_SOME_NEW || box1 >= STRUGGLING_BOX1) count = 1;
    count = Math.max(0, count - introducedToday);
    if (!count) return [];

    const fresh: string[] = [];
    for (const u of library.units) {
      if (u.order < unit) continue;
      for (const c of library.unitCards(u.order)) {
        if (!deck.has(c.id) && !fresh.includes(c.id)) fresh.push(c.id);
        if (fresh.length >= count) return fresh;
      }
      break; // never pull words from a later unit: the current one must be finished first
    }
    return fresh;
  }

  /** Next challenge word never introduced, at most one per day. */
  pickChallenge({ library, deck, events, today }: PlannerInput): string | undefined {
    const order = new Set(library.challengeOrder);
    if (events.some((e) => e.day === today && e.activity === 'new-word' && order.has(e.itemId))) return undefined;
    return library.challengeOrder.find((id) => !deck.has(id));
  }

  /** Unread stories first (alternating tiers); once all are read, redo the weakest, favoring focus skills. */
  pickStory(library: ContentLibrary, events: PracticeEvent[], unit: number): Story | undefined {
    const available = library.stories.filter((s) => s.unit <= unit);
    if (!available.length) return undefined;
    const score = new Map<string, { right: number; total: number; lastAt: number }>();
    for (const e of events) {
      if (e.activity !== 'story-question') continue;
      const id = e.itemId.split(':')[0] as string;
      const s = score.get(id) ?? { right: 0, total: 0, lastAt: 0 };
      s.total++;
      if (e.outcome !== 'missed') s.right++;
      s.lastAt = Math.max(s.lastAt, e.at);
      score.set(id, s);
    }
    const unread = available.filter((s) => !score.has(s.id));
    if (unread.length) {
      const lastRead = [...score.entries()].sort((a, b) => b[1].lastAt - a[1].lastAt)[0]?.[0];
      const lastTier = lastRead ? library.story(lastRead)?.tier : undefined;
      return unread.find((s) => s.tier !== lastTier) ?? unread[0];
    }
    const weight = (s: Story): number => {
      const sc = score.get(s.id);
      const acc = sc && sc.total ? sc.right / sc.total : 0;
      return acc - (FOCUS_SKILLS.has(s.skill) ? 0.15 : 0);
    };
    return [...available].sort((a, b) => weight(a) - weight(b) || (score.get(a.id)?.lastAt ?? 0) - (score.get(b.id)?.lastAt ?? 0))[0];
  }
}
