import { describe, expect, it } from 'vitest';
import { sentenceMeta, sentenceOutcome, wordsRead, type SentenceCheck } from '../src/domain/reading/SentenceCheck';
import { dashboard } from '../src/domain/analysis/Dashboard';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { ev, SOURCE } from './fixtures';

const check = (helped: number[], whole: boolean): SentenceCheck =>
  ({ text: 'I like to play soccer.', words: ['I', 'like', 'to', 'play', 'soccer'], helped, whole });

describe('SentenceCheck', () => {
  it('every word alone and the whole sentence is a first-try read', () => {
    expect(sentenceOutcome(check([], true))).toBe('first-try');
  });
  it('the whole sentence right after help on a word still counts, but not as first try', () => {
    expect(sentenceOutcome(check([4], true))).toBe('after-retry');
  });
  it('80% of the words alone counts even if the whole sentence needs practice', () => {
    expect(sentenceOutcome(check([4], false))).toBe('after-retry');
    expect(sentenceOutcome(check([3, 4], false))).toBe('missed');
  });
  it('meta lists the words that needed help', () => {
    expect(wordsRead(check([3, 4], true))).toBe(3);
    expect(sentenceMeta(check([3, 4], true))).toEqual({ text: 'I like to play soccer.', words: 5, wordsRead: 3, whole: true, helped: 'play soccer' });
  });
});

describe('dashboard: reading coach', () => {
  it('lists recent sentences newest first with totals', () => {
    const lib = new ContentLibrary(SOURCE);
    const events = [
      ev('sentence', 's01:s0', 1, 'first-try', { meta: sentenceMeta(check([], true)) }),
      ev('sentence', 's01:s1', 2, 'missed', { meta: sentenceMeta(check([1, 3, 4], false)) }),
      ev('sentence', 'u01:s0', 2, 'first-try'), // old-style sentence event without coach meta: ignored
    ];
    const d = dashboard(events, lib, 2);
    expect(d.sentences.map((s) => s.wordsRead)).toEqual([2, 5]);
    expect(d.sentenceTotals).toEqual({ words: 10, wordsRead: 7, sentences: 2, whole: 1 });
    expect(d.sentences[0]?.helped).toBe('like play soccer');
  });
});
