import type { Outcome } from '../storage/events';
import type { MatchLevel } from './AnswerMatcher';

/**
 * How a word attempt becomes an outcome. Two tries per word:
 *  - match on try 1 -> first-try (goal, card moves up)
 *  - match on try 2, or "close" -> after-retry (goal, card stays)
 *  - otherwise -> missed (we model it, card goes back to box 1)
 * The child never sees "wrong": misses end with "Listen... now you!" and the model audio.
 */
export const MAX_TRIES = 2;

export function outcomeFor(levels: MatchLevel[]): Outcome {
  if (levels[0] === 'match') return 'first-try';
  if (levels.slice(0, MAX_TRIES).some((l) => l === 'match' || l === 'close')) return 'after-retry';
  return 'missed';
}
