import type { ContentLibrary } from '../content/ContentLibrary';
import type { Story, StorySkill } from '../content/types';
import type { TopicChoice } from '../practice/Topics';
import { dueCards, type DeckState } from '../srs/Leitner';
import type { PracticeEvent } from '../storage/events';

export type WarmupGame = 'rhyme' | 'blend' | 'segment' | 'syllables' | 'sound-it-out';
export type WritingMode = 'off' | 'trace' | 'tiles' | 'free';
export type SessionMinutes = 5 | 10 | 15;

export type Step =
  | { kind: 'warmup'; game: WarmupGame; unit: number; rounds?: number }
  | { kind: 'review'; cardId: string }
  | { kind: 'new-word'; cardId: string }
  | { kind: 'write'; cardId: string; mode: Exclude<WritingMode, 'off'> }
  | { kind: 'sentence'; unit: number; index: number }
  | { kind: 'story'; storyId: string }
  | { kind: 'game'; game: 'tricky' | 'tiles'; unit: number }
  | { kind: 'fluency'; unit: number; storyId?: string };

export interface SessionSettings {
  minutes: SessionMinutes;
  writing: WritingMode;
  /** Units before this are treated as known (placement). */
  startUnit: number;
  /** One grade-level challenge word a day in 10/15-minute sessions (default on). */
  challenge?: boolean;
  /** "Tarea de esta semana": stories with this skill come first until `until` (a day number). */
  homework?: { skill: StorySkill; until: number };
  /** Chosen-topic sessions start with up to 2 minutes of due review words (default on). */
  topicReview?: boolean;
}

export interface SessionPlan {
  steps: Step[];
  unit: number;
  estimatedSeconds: number;
}

/** Rough seconds per step for a six-year-old, used to fit the parent's 5/10/15 choice. */
export const STEP_SECONDS: Readonly<Record<Step['kind'], number>> = {
  warmup: 60, review: 15, 'new-word': 35, write: 30, sentence: 75, story: 480, game: 90, fluency: 150,
};

/** Review words before a chosen topic: about 2 minutes. */
const TOPIC_REVIEW_MAX = 8;
/** A chosen sound game runs as one longer game instead of the 3-round warm-up. */
const TOPIC_GAME_ROUNDS = 8;

const CORE_SECONDS = 300;
const NEW_PER_DAY = 3;
/** Heavy review load means fewer new words: consolidation beats coverage. */
const DUE_SOME_NEW = 12;
const DUE_NO_NEW = 20;
const STRUGGLING_BOX1 = 8;
/**
 * Grade-1 sound skills (blend, segment: ELA.1.F.1.2) lead; rhyme stays as Kindergarten review
 * because i-Ready flagged it.
 */
const WARMUP_ROTATION: readonly WarmupGame[] = ['blend', 'segment', 'rhyme', 'sound-it-out', 'segment', 'syllables'];
/** Skills he missed in homework get a nudge when choosing a story to repeat. */
const FOCUS_SKILLS: ReadonlySet<StorySkill> = new Set(['compare', 'time-words']);

/** The homework skill while its week lasts. */
export function homeworkSkill(settings: SessionSettings, today: number): StorySkill | undefined {
  return settings.homework && today <= settings.homework.until ? settings.homework.skill : undefined;
}

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
    const reviews = this.dueToday(input).slice(0, reviewSlots);

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
      const story = this.pickStory(library, events, unit, homeworkSkill(settings, today));
      if (story) steps.push({ kind: 'story', storyId: story.id });
    }
    if (settings.minutes >= 15) {
      steps.push({ kind: 'game', game: 'tricky', unit });
      steps.push({ kind: 'game', game: 'tiles', unit });
    }
    return { steps, unit, estimatedSeconds: steps.reduce((s, x) => s + STEP_SECONDS[x.kind], 0) };
  }

  /**
   * A session on the topic the grown-up chose: up to 2 minutes of due review first (unless turned
   * off), then about 5-8 minutes of that topic. Phonics units ahead of his level are allowed.
   */
  planTopic(input: PlannerInput, choice: TopicChoice): SessionPlan {
    const { library, deck, events, today, settings } = input;
    const unit = this.currentUnit(library, deck, settings.startUnit);
    const steps: Step[] = [];
    if (settings.topicReview !== false) for (const c of this.dueToday(input).slice(0, TOPIC_REVIEW_MAX)) steps.push({ kind: 'review', cardId: c.id });

    const fresh = (ids: string[], n: number): string[] => ids.filter((id) => !deck.has(id)).slice(0, n);
    const known = (ids: string[], n: number): string[] => ids.filter((id) => deck.has(id)).slice(0, n);
    const reviewAll = (ids: string[]): void => { for (const id of ids) steps.push({ kind: 'review', cardId: id }); };
    const newAll = (ids: string[]): void => { for (const id of ids) steps.push({ kind: 'new-word', cardId: id }); };
    const listed = new Set(steps.map((x) => (x.kind === 'review' ? x.cardId : '')));
    const notListed = (ids: string[]): string[] => ids.filter((id) => !listed.has(id));

    switch (choice.topic) {
      case 'blend': case 'segment': case 'syllables': case 'rhyme':
        steps.push({ kind: 'warmup', game: choice.topic, unit, rounds: TOPIC_GAME_ROUNDS });
        break;
      case 'phonics': {
        const u = library.unit(choice.unit ?? unit) ?? library.unit(unit);
        if (!u) break;
        const ids = library.unitCards(u.order).filter((c) => c.kind === 'decodable').map((c) => c.id);
        steps.push({ kind: 'warmup', game: 'sound-it-out', unit: u.order });
        newAll(fresh(ids, NEW_PER_DAY));
        reviewAll(notListed(known(ids, 5)));
        if (u.sentences.length) steps.push({ kind: 'sentence', unit: u.order, index: today % u.sentences.length });
        if (u.contrasts.length) steps.push({ kind: 'game', game: 'tricky', unit: u.order });
        break;
      }
      case 'tricky':
        steps.push({ kind: 'game', game: 'tricky', unit }, { kind: 'game', game: 'tricky', unit });
        break;
      case 'heart': {
        const ids = library.units.filter((x) => x.order <= unit).flatMap((x) => library.unitCards(x.order)).filter((c) => c.kind === 'heart').map((c) => c.id);
        newAll(fresh(ids, NEW_PER_DAY));
        reviewAll(notListed(known(ids, 6)));
        break;
      }
      case 'fluency': {
        const story = library.stories.filter((x) => x.tier === 'decodable' && x.unit <= unit).at(-1);
        steps.push({ kind: 'fluency', unit, storyId: story?.id });
        break;
      }
      case 'sentences': {
        for (const u of library.units.filter((x) => x.order <= unit && x.sentences.length).slice(-3)) {
          steps.push({ kind: 'sentence', unit: u.order, index: today % u.sentences.length });
        }
        break;
      }
      case 'story': {
        const story = this.pickStory(library, events, Math.max(unit, library.lastUnit()), choice.skill);
        if (story) steps.push({ kind: 'story', storyId: story.id });
        break;
      }
      case 'challenge':
        newAll(fresh(library.challengeOrder, 2));
        reviewAll(notListed(known(library.challengeOrder, 4)));
        break;
      case 'spelling':
        steps.push({ kind: 'game', game: 'tiles', unit }, { kind: 'game', game: 'tiles', unit });
        break;
      case 'handwriting': {
        const ids = [...deck.keys()].filter((id) => library.card(id)?.kind === 'decodable').slice(-3);
        ids.forEach((id, i) => steps.push({ kind: 'write', cardId: id, mode: i === ids.length - 1 ? 'free' : 'trace' }));
        break;
      }
    }
    return { steps, unit, estimatedSeconds: steps.reduce((s, x) => s + STEP_SECONDS[x.kind], 0) };
  }

  /** Due cards not reviewed yet today, weakest first. */
  private dueToday({ deck, events, today }: PlannerInput): ReturnType<typeof dueCards> {
    const reviewedToday = new Set(events.filter((e) => e.day === today && e.activity === 'review').map((e) => e.itemId));
    return dueCards(deck, today).filter((c) => !reviewedToday.has(c.id));
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

  /**
   * Unread stories first (alternating tiers); once all are read, redo the weakest, favoring focus
   * skills. With `skill` (homework week or a chosen topic) only stories with that skill are
   * considered, unless none has it.
   */
  pickStory(library: ContentLibrary, events: PracticeEvent[], unit: number, skill?: StorySkill): Story | undefined {
    const reachable = library.stories.filter((s) => s.unit <= unit);
    const withSkill = skill ? reachable.filter((s) => s.skill === skill || (skill === 'moral' && !!s.moral)) : [];
    const available = withSkill.length ? withSkill : reachable;
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
