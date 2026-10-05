import type { StandardStat } from '../standards/Standards';
import { TOPICS, type Topic, type TopicId } from './Topics';

export interface TopicStat { attempts: number; correct: number; lastDay: number }

/** Below this accuracy (with enough tries) a topic needs work. */
const WEAK = 0.8;
const MIN_TRIES = 4;

/** Practice totals for a topic: summed over its benchmarks. */
export function topicStat(t: Topic, stats: StandardStat[]): TopicStat {
  const mine = stats.filter((s) => t.benchmarks.includes(s.code));
  return {
    attempts: mine.reduce((n, s) => n + s.attempts, 0),
    correct: mine.reduce((n, s) => n + s.correct, 0),
    lastDay: mine.reduce((d, s) => Math.max(d, s.lastDay), -Infinity),
  };
}

/**
 * The topic to suggest: the weakest grade-1 topic (accuracy under 80% with at least 4 tries);
 * otherwise the one practiced longest ago (never practiced first). Kindergarten review is never suggested.
 */
export function recommendTopic(stats: StandardStat[]): TopicId {
  const candidates = TOPICS.filter((t) => !t.review).map((t) => ({ t, s: topicStat(t, stats) }));
  const weak = candidates
    .filter(({ s }) => s.attempts >= MIN_TRIES && s.correct / s.attempts < WEAK)
    .sort((a, b) => a.s.correct / a.s.attempts - b.s.correct / b.s.attempts);
  if (weak[0]) return weak[0].t.id;
  const stale = [...candidates].sort((a, b) => a.s.lastDay - b.s.lastDay);
  return (stale[0]?.t.id ?? 'phonics');
}
