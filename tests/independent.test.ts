import { describe, expect, it } from 'vitest';
import { isPracticeEvent } from '../src/domain/storage/events';
import { rebuildDeck } from '../src/domain/srs/Leitner';
import { dashboard } from '../src/domain/analysis/Dashboard';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { isGoal } from '../src/domain/rewards/Rewards';
import { standardStats } from '../src/domain/standards/Standards';
import { sentenceOutcome, wordsRead } from '../src/domain/reading/SentenceCheck';
import { DEFAULT_SETTINGS, toProfile } from '../src/domain/profiles/Profile';
import { ev, SOURCE } from './fixtures';

const lib = new ContentLibrary(SOURCE);

describe('unverified independent practice', () => {
  it('survives backup validation without becoming a goal or checked accuracy', () => {
    const events = [ev('review', 'w:cat', 1, 'unverified', { source: 'self' }),
      ev('sentence', 'u01:s0', 1, 'unverified', { source: 'self', meta: { text: 'A cat.', words: 2, wordsRead: 0 } })];
    expect(events.every((e) => isPracticeEvent(JSON.parse(JSON.stringify(e))))).toBe(true);
    expect(events.some(isGoal)).toBe(false);
    expect(standardStats(events, lib)).toEqual([]);
    const d = dashboard(events, lib, 1);
    expect(d.firstTryRate).toBeNull();
    expect(d.sentenceTotals.sentences).toBe(0);
    expect(d.troubleWords).toEqual([]);
    expect(d.unverified.map((x) => x.text)).toEqual(['A cat.', 'cat']);
  });

  it('introduces a word for review but never promotes, demotes, or postpones a due card', () => {
    const start = [ev('new-word', 'w:cat', 0, 'unverified')];
    const before = rebuildDeck(start).get('w:cat');
    expect(before).toMatchObject({ box: 1, reads: 0, misses: 0, due: 1 });
    const repeats = Array.from({ length: 12 }, (_, i) => ev('review', 'w:cat', i + 1, 'unverified'));
    expect(rebuildDeck([...start, ...repeats]).get('w:cat')).toEqual(before);
    const checked = [...start, ev('review', 'w:cat', 1)];
    expect(rebuildDeck([...checked, ...repeats]).get('w:cat')).toEqual(rebuildDeck(checked).get('w:cat'));
  });

  it('never derives a sentence pass from an unchecked repetition', () => {
    const sentence = { text: 'A cat.', words: ['A', 'cat'], helped: [], whole: false, unverified: true };
    expect(sentenceOutcome(sentence)).toBe('unverified');
    expect(wordsRead(sentence)).toBe(0);
  });

  it('uses independent defaults for new players while preserving legacy parent choices', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ minutes: 5, checkMode: 'independent', challenge: false });
    const legacy = toProfile({ id: 'p1', firstName: 'Sam', settings: { minutes: 10 } });
    expect(legacy?.settings.checkMode).toBe('record');
    expect(toProfile({ id: 'p1', firstName: 'Sam', settings: DEFAULT_SETTINGS })?.settings.checkMode).toBe('independent');
  });
});
