import type { PracticeEvent } from '../storage/events';

/**
 * Soccer + building blocks. Every word read right is a goal; every 3 goals earn a block;
 * blocks build his stadium piece by piece. Original art only - no club, league or toy brands.
 */
export const GOALS_PER_BLOCK = 3;

export interface StadiumPart { id: string; name: string; blocks: number; emoji: string }

/** Cumulative block cost of each piece, cheapest first so the first week already builds something. */
export const STADIUM_PARTS: readonly StadiumPart[] = [
  { id: 'grass', name: 'Grass field', blocks: 3, emoji: '🟩' },
  { id: 'ball', name: 'Match ball', blocks: 6, emoji: '⚽' },
  { id: 'goal-left', name: 'Left goal', blocks: 10, emoji: '🥅' },
  { id: 'goal-right', name: 'Right goal', blocks: 15, emoji: '🥅' },
  { id: 'lines', name: 'Field lines', blocks: 21, emoji: '⬜' },
  { id: 'bench', name: 'Team bench', blocks: 28, emoji: '🪑' },
  { id: 'stands-1', name: 'Fan stands', blocks: 36, emoji: '🏟️' },
  { id: 'flags', name: 'Corner flags', blocks: 45, emoji: '🚩' },
  { id: 'scoreboard', name: 'Scoreboard', blocks: 55, emoji: '🔢' },
  { id: 'lights', name: 'Night lights', blocks: 66, emoji: '💡' },
  { id: 'stands-2', name: 'Big stands', blocks: 80, emoji: '🏟️' },
  { id: 'trophy', name: 'Trophy room', blocks: 100, emoji: '🏆' },
];

/** Activities where a correct answer is a goal. */
const SCORING = new Set(['new-word', 'review', 'sentence', 'story-question', 'story-bonus', 'story-order', 'warmup', 'tricky', 'write']);

export function isGoal(e: PracticeEvent): boolean {
  return SCORING.has(e.activity) && e.outcome !== 'missed';
}

export interface Trophies {
  goals: number;
  blocks: number;
  built: StadiumPart[];
  next: StadiumPart | null;
  blocksToNext: number;
  /** Consecutive practice days ending today or yesterday (a missed day today isn't a broken streak yet). */
  streak: number;
}

export function trophies(events: PracticeEvent[], today: number): Trophies {
  const goals = events.filter(isGoal).length;
  const blocks = Math.floor(goals / GOALS_PER_BLOCK);
  const built = STADIUM_PARTS.filter((p) => p.blocks <= blocks);
  const next = STADIUM_PARTS.find((p) => p.blocks > blocks) ?? null;
  return { goals, blocks, built, next, blocksToNext: next ? next.blocks - blocks : 0, streak: streak(events, today) };
}

export function streak(events: PracticeEvent[], today: number): number {
  const days = new Set(events.filter((e) => e.activity === 'session').map((e) => e.day));
  let day = days.has(today) ? today : today - 1;
  let n = 0;
  while (days.has(day)) { n++; day--; }
  return n;
}
