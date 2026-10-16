import { byTime, type PracticeEvent } from '../storage/events';

/**
 * Leitner spaced repetition. Box 1 = learning, box 6 = mastered (monthly check-up).
 * Interval in days after landing in each box: a word read right moves up and comes back later;
 * a miss sends it back to box 1 so it shows up again tomorrow.
 */
export const INTERVAL_DAYS: Readonly<Record<number, number>> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14, 6: 30 };
export const MASTERED_BOX = 6;
/** A mastered word that slips goes to box 3, not 1: it was known for weeks. */
const MASTERED_SLIP_BOX = 3;

export interface CardState {
  id: string;
  box: number;
  due: number;
  introducedDay: number;
  lastDay: number;
  reads: number;
  misses: number;
}

export type DeckState = Map<string, CardState>;

/** Rebuilds every card's box from the event log. Pure and deterministic. */
export function rebuildDeck(events: PracticeEvent[]): DeckState {
  const deck: DeckState = new Map();
  for (const e of [...events].sort(byTime)) apply(deck, e);
  return deck;
}

function apply(deck: DeckState, e: PracticeEvent): void {
  if (!e.itemId.startsWith('w:')) return;
  const s = deck.get(e.itemId);

  if (e.activity === 'new-word') {
    if (s) return; // introduced once; later new-word events (another device) change nothing
    deck.set(e.itemId, { id: e.itemId, box: 1, due: e.day + 1, introducedDay: e.day, lastDay: e.day, reads: e.outcome === 'unverified' ? 0 : 1, misses: e.outcome === 'missed' ? 1 : 0 });
    return;
  }

  if (e.activity === 'story-read') {
    // A story miss puts the word in the deck (or back to box 1); a story hit never promotes.
    if (e.outcome !== 'missed') return;
    if (!s) { deck.set(e.itemId, { id: e.itemId, box: 1, due: e.day + 1, introducedDay: e.day, lastDay: e.day, reads: 1, misses: 1 }); return; }
    demote(s, e.day);
    return;
  }

  // Practice without a usable microphone is neither a pass nor a miss. Keep it due.
  if (e.outcome === 'unverified') return;
  if (e.activity !== 'review' || !s) return;
  s.reads++;
  s.lastDay = e.day;
  if (e.outcome === 'missed') { demote(s, e.day); return; }
  if (e.outcome === 'after-retry') { s.due = Math.max(s.due, e.day + 1); return; }
  // First-try read: promote only when it was actually due (extra reps the same day don't skip boxes).
  if (e.day < s.due) return;
  s.box = Math.min(MASTERED_BOX, s.box + 1);
  s.due = e.day + (INTERVAL_DAYS[s.box] ?? 1);
}

function demote(s: CardState, day: number): void {
  s.misses++;
  s.lastDay = day;
  s.box = s.box >= MASTERED_BOX ? MASTERED_SLIP_BOX : 1;
  s.due = day + (INTERVAL_DAYS[s.box] ?? 0);
}

/** Cards due on `today`, weakest first (lowest box, then most overdue). */
export function dueCards(deck: DeckState, today: number): CardState[] {
  return [...deck.values()]
    .filter((s) => s.due <= today)
    .sort((a, b) => a.box - b.box || a.due - b.due || a.id.localeCompare(b.id));
}

export function isMastered(s: CardState): boolean { return s.box >= MASTERED_BOX; }
