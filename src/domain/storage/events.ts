/**
 * The event log is the source of truth. Leitner boxes, streaks, minutes and dashboards are
 * all rebuilt from it, so sync only has to move events (append-only, merged as a union by id).
 */
export const EVENT_SCHEMA = 1;

export type Activity =
  | 'new-word'        // introduced today: hear, sound out, say it 3 times
  | 'review'          // due card read aloud
  | 'sentence'        // decodable sentence read aloud
  | 'warmup'          // rhyme / blend / syllables / sound-it-out
  | 'tricky'          // contrast pair listening
  | 'write'           // trace, tiles or free write
  | 'story-read'      // one word inside Read With Me
  | 'story-question'
  | 'story-bonus'
  | 'story-order'
  | 'retell'          // beginning / middle / end retell (meta: parts)
  | 'fluency'         // 1-minute read (meta: wcpm, words, errors, seconds, prosody)
  | 'session';        // one finished session (meta: plannedMin, durationMs, goals)

export type Outcome = 'first-try' | 'after-retry' | 'missed';
export type Source = 'mic' | 'grownup' | 'tap' | 'trace' | 'tiles' | 'self';

export interface PracticeEvent {
  v: typeof EVENT_SCHEMA;
  id: string;
  profileId: string;
  /** Epoch ms. */
  at: number;
  /** Local calendar day number (see Clock.today). */
  day: number;
  activity: Activity;
  /** Card id ('w:cat'), sentence/story id ('u01:s0', 's01:q2'), or session id. */
  itemId: string;
  outcome: Outcome;
  source: Source;
  meta?: Record<string, string | number | boolean>;
}

const ACTIVITIES: ReadonlySet<string> = new Set<Activity>(['new-word', 'review', 'sentence', 'warmup', 'tricky', 'write', 'story-read', 'story-question', 'story-bonus', 'story-order', 'retell', 'fluency', 'session']);
const OUTCOMES: ReadonlySet<string> = new Set<Outcome>(['first-try', 'after-retry', 'missed']);

/** Shape check for events from outside this device (server pull, backup file). */
export function isPracticeEvent(x: unknown): x is PracticeEvent {
  const e = x as PracticeEvent;
  return !!e && typeof e === 'object' && e.v === EVENT_SCHEMA && typeof e.id === 'string' && typeof e.profileId === 'string'
    && Number.isFinite(e.at) && Number.isInteger(e.day) && typeof e.itemId === 'string'
    && ACTIVITIES.has(e.activity) && OUTCOMES.has(e.outcome)
    && (e.meta === undefined || (typeof e.meta === 'object' && e.meta !== null));
}

/** Stable ordering for deterministic rebuilds on every device. */
export function byTime(a: PracticeEvent, b: PracticeEvent): number {
  return a.at - b.at || a.id.localeCompare(b.id);
}

/** Union by id. Same id = same event, so merging twice changes nothing (idempotent). */
export function mergeEvents(...lists: PracticeEvent[][]): PracticeEvent[] {
  const map = new Map<string, PracticeEvent>();
  for (const list of lists) for (const e of list) if (!map.has(e.id)) map.set(e.id, e);
  return [...map.values()].sort(byTime);
}

export function newEventId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
