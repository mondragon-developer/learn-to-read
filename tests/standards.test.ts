import { describe, expect, it } from 'vitest';
import { benchmarksOf, standardStats } from '../src/domain/standards/Standards';
import { accuracy, normFor, percentileBand, seasonOf, wcpm } from '../src/domain/reading/Fluency';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { ev, SOURCE } from './fixtures';

const lib = new ContentLibrary(SOURCE);

describe('benchmarksOf', () => {
  it('maps word practice to the unit phonics codes, heart words to sight words, challenge to two-syllable + vocabulary', () => {
    expect(benchmarksOf(ev('review', 'w:cat', 0), lib)).toEqual(['ELA.1.F.1.3.c']);
    expect(benchmarksOf(ev('new-word', 'w:the', 0), lib)).toEqual(['ELA.1.F.1.4.a']);
    expect(benchmarksOf(ev('new-word', 'w:robin', 0), lib)).toEqual(['ELA.1.F.1.3.e', 'ELA.1.V.1.1']);
    expect(benchmarksOf(ev('story-read', 'w:gold', 0), lib)).toEqual(['ELA.1.F.1.4']);
  });

  it('maps sound games, keeping rhyme as a Kindergarten review benchmark', () => {
    expect(benchmarksOf(ev('warmup', 'rhyme:cat', 0), lib)).toEqual(['ELA.K.F.1.2.b']);
    expect(benchmarksOf(ev('warmup', 'segment:stamp', 0, 'first-try', { meta: { phonemes: 5 } }), lib)).toEqual(['ELA.1.F.1.2.a', 'ELA.1.F.1.2.d']);
    expect(benchmarksOf(ev('warmup', 'segment:cat', 0, 'first-try', { meta: { phonemes: 3 } }), lib)).toEqual(['ELA.1.F.1.2.a']);
  });

  it('maps story questions by skill, retell, fluency and writing modes', () => {
    expect(benchmarksOf(ev('story-question', 's01:q0', 0, 'first-try', { meta: { skill: 'compare' } }), lib)).toEqual(['ELA.1.R.3.3']);
    expect(benchmarksOf(ev('story-question', 's01:m', 0, 'first-try', { meta: { skill: 'moral' } }), lib)).toEqual(['ELA.1.R.1.2']);
    expect(benchmarksOf(ev('retell', 's01:retell', 0), lib)).toEqual(['ELA.1.R.3.2.a']);
    expect(benchmarksOf(ev('fluency', 's01', 0), lib)).toEqual(['ELA.1.F.1.4']);
    expect(benchmarksOf(ev('write', 'w:cat', 0, 'first-try', { meta: { mode: 'trace' } }), lib)).toEqual(['ELA.1.C.1.1']);
    expect(benchmarksOf(ev('write', 'w:cat', 0, 'first-try', { meta: { mode: 'tiles' } }), lib)).toEqual(['ELA.1.F.1.3.c', 'ELA.1.C.3.1']);
    expect(benchmarksOf(ev('session', 'x', 0), lib)).toEqual([]);
  });

  it('counts attempts, right answers and the last day per benchmark', () => {
    const stats = standardStats([ev('review', 'w:cat', 1), ev('review', 'w:map', 3, 'missed'), ev('warmup', 'rhyme:cat', 2)], lib);
    expect(stats).toEqual([
      { code: 'ELA.1.F.1.3.c', attempts: 2, correct: 1, lastDay: 3 },
      { code: 'ELA.K.F.1.2.b', attempts: 1, correct: 1, lastDay: 2 },
    ]);
  });
});

describe('Fluency', () => {
  it('words correct per minute and accuracy', () => {
    expect(wcpm({ words: 34, errors: 4, seconds: 60 })).toBe(30);
    expect(wcpm({ words: 20, errors: 0, seconds: 40 })).toBe(30); // finished early: scaled to a minute
    expect(accuracy({ words: 34, errors: 4, seconds: 60 })).toBeCloseTo(0.882, 3);
  });
  it('fall reads are compared with the winter checkpoint (there is no grade-1 fall norm)', () => {
    expect(seasonOf(new Date(2026, 9, 4))).toBe('fall');
    expect(normFor('fall')).toMatchObject({ season: 'winter', target: 29 });
    expect(normFor('spring').target).toBe(60);
  });
  it('places a score in a percentile band', () => {
    const { table } = normFor('winter');
    expect(percentileBand(30, table)).toBe(50);
    expect(percentileBand(12, table)).toBe(10);
    expect(percentileBand(5, table)).toBe(0);
  });
});

import { recommendTopic, topicStat } from '../src/domain/practice/Recommend';
import { topic } from '../src/domain/practice/Topics';

describe('recommendTopic', () => {
  const stat = (code: string, attempts: number, correct: number, lastDay: number) => ({ code, attempts, correct, lastDay });
  const all = ['ELA.1.F.1.2.a', 'ELA.1.F.1.2.b', 'ELA.1.F.1.2.c', 'ELA.1.F.1.2.d', 'ELA.1.F.1.2.e', 'ELA.1.F.1.3.a', 'ELA.1.F.1.3.c', 'ELA.1.F.1.3.d', 'ELA.1.F.1.3.e', 'ELA.1.F.1.3.f', 'ELA.1.F.1.2', 'ELA.1.F.1.4.a', 'ELA.1.F.1.4', 'ELA.1.R.1.1', 'ELA.1.R.1.2', 'ELA.1.R.3.2.a', 'ELA.1.R.3.3', 'ELA.1.V.1.1', 'ELA.1.C.3.1', 'ELA.1.C.1.1'];

  it('suggests the weakest topic with enough tries', () => {
    const stats = all.map((c) => stat(c, 10, 10, 5));
    stats[0] = stat('ELA.1.F.1.2.a', 10, 4, 5); // segmenting: 40%
    expect(recommendTopic(stats)).toBe('segment');
  });

  it('otherwise suggests what was never or least recently practiced, never K review', () => {
    expect(recommendTopic([])).not.toBe('rhyme');
    const stats = all.map((c) => stat(c, 10, 10, c === 'ELA.1.F.1.4.a' ? 1 : 9));
    expect(recommendTopic(stats)).toBe('heart');
  });

  it('sums a topic over its benchmarks', () => {
    expect(topicStat(topic('blend'), [stat('ELA.1.F.1.2.b', 3, 2, 4), stat('ELA.1.F.1.2.c', 1, 1, 6)])).toEqual({ attempts: 4, correct: 3, lastDay: 6 });
  });
});
