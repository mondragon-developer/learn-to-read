import type { ContentLibrary } from '../content/ContentLibrary';
import type { StorySkill } from '../content/types';
import type { PracticeEvent } from '../storage/events';

/**
 * Which Florida B.E.S.T. benchmarks a practice event exercised. Derived from the event (not stored
 * in it), so the whole history counts, and remapping a skill fixes old events too.
 */
export const SKILL_BENCHMARKS: Readonly<Record<StorySkill, string[]>> = {
  sequence: ['ELA.1.R.1.1'],
  detail: ['ELA.1.R.1.1'],
  compare: ['ELA.1.R.3.3'],
  'time-words': ['ELA.1.V.1.3'],
  'main-topic': ['ELA.1.R.2.2'],
  moral: ['ELA.1.R.1.2'],
};

const WARMUP: Readonly<Record<string, string[]>> = {
  rhyme: ['ELA.K.F.1.2.b'],           // Kindergarten benchmark, kept as review (i-Ready flagged rhyme)
  blend: ['ELA.1.F.1.2.b'],
  segment: ['ELA.1.F.1.2.a'],
  syllables: ['ELA.1.F.1.2.e'],
  'sound-it-out': ['ELA.1.F.1.3.c'],
};

export function benchmarksOf(e: PracticeEvent, library: ContentLibrary): string[] {
  switch (e.activity) {
    case 'new-word':
    case 'review':
    case 'story-read': return wordBenchmarks(e.itemId, library);
    case 'warmup': {
      const game = e.itemId.split(':')[0] ?? '';
      const codes = WARMUP[game] ?? [];
      return game === 'segment' && Number(e.meta?.phonemes) >= 5 ? [...codes, 'ELA.1.F.1.2.d'] : codes;
    }
    case 'tricky': return ['ELA.1.F.1.2'];
    case 'write': return e.meta?.mode === 'trace' ? ['ELA.1.C.1.1'] : ['ELA.1.F.1.3.c', 'ELA.1.C.3.1'];
    case 'sentence':
    case 'fluency': return ['ELA.1.F.1.4'];
    case 'story-question': return SKILL_BENCHMARKS[e.meta?.skill as StorySkill] ?? [];
    case 'story-bonus': return e.meta?.kind === 'rhyme' ? ['ELA.K.F.1.2.b'] : ['ELA.1.V.1.3'];
    case 'story-order': return ['ELA.1.R.1.1'];
    case 'retell': return ['ELA.1.R.3.2.a'];
    case 'session': return [];
  }
}

function wordBenchmarks(itemId: string, library: ContentLibrary): string[] {
  const card = library.card(itemId);
  if (!card) return ['ELA.1.F.1.4'];                       // a story word met while reading
  if (card.kind === 'challenge') return ['ELA.1.F.1.3.e', 'ELA.1.V.1.1'];
  if (card.kind === 'heart') return ['ELA.1.F.1.4.a'];
  const unit = library.unit(card.unit);
  const phonics = (unit?.benchmarks ?? []).filter((c) => c.startsWith('ELA.1.F.1.3'));
  return phonics.length ? phonics : ['ELA.1.F.1.3'];
}

export interface StandardStat { code: string; attempts: number; correct: number; lastDay: number }

/** Attempts, right answers and last practice day per benchmark. */
export function standardStats(events: PracticeEvent[], library: ContentLibrary): StandardStat[] {
  const map = new Map<string, StandardStat>();
  for (const e of events) {
    if (e.outcome === 'unverified') continue;
    for (const code of benchmarksOf(e, library)) {
      const s = map.get(code) ?? { code, attempts: 0, correct: 0, lastDay: -Infinity };
      s.attempts++;
      if (e.outcome !== 'missed') s.correct++;
      s.lastDay = Math.max(s.lastDay, e.day);
      map.set(code, s);
    }
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}
