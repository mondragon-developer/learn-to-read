import { describe, expect, it } from 'vitest';
import { AnswerMatcher } from '../src/domain/speech/AnswerMatcher';
import { SentenceMatcher } from '../src/domain/speech/SentenceMatcher';
import { outcomeFor } from '../src/domain/speech/Grading';
import { MicHealth } from '../src/domain/speech/PronunciationChecker';

describe('AnswerMatcher', () => {
  const m = new AnswerMatcher();

  it('matches the word in any alternative, ignoring case and punctuation', () => {
    expect(m.matchWord('cat', ['Cut.', 'Cat!']).level).toBe('match');
  });

  it('accepts homophones and digits', () => {
    expect(m.matchWord('to', ['2']).level).toBe('match');
    expect(m.matchWord('see', ['sea']).level).toBe('match');
    expect(m.matchWord('I', ['eye']).level).toBe('match');
  });

  it('accepts a recognizer-added plural', () => {
    expect(m.matchWord('cat', ['cats']).level).toBe('match');
  });

  it('never accepts a vowel swap: that is the decoding skill', () => {
    expect(m.matchWord('cat', ['cut', 'cot']).level).toBe('no');
    expect(m.matchWord('ship', ['sheep']).level).toBe('no');
    expect(m.matchWord('bed', ['bad']).level).toBe('no');
  });

  it('marks Spanish-influenced sound swaps as close, with the sound to model', () => {
    expect(m.matchWord('the', ['da'])).toMatchObject({ level: 'close', hint: 'th' });
    expect(m.matchWord('ship', ['chip'])).toMatchObject({ level: 'close', hint: 'sh' });
    expect(m.matchWord('van', ['ban'])).toMatchObject({ level: 'close', hint: 'v' });
  });

  it('ignores long phrases that merely contain the word', () => {
    expect(m.matchWord('cat', ['I want to see the cat']).level).toBe('no');
    expect(m.matchWord('cat', ['the cat']).level).toBe('match');
  });

  it('returns no on silence', () => {
    expect(m.matchWord('cat', [])).toEqual({ level: 'no', heard: '' });
  });
});

describe('SentenceMatcher', () => {
  const s = new SentenceMatcher();

  it('scores a perfect read', () => {
    const r = s.match('The cat sat on a mat.', 'the cat sat on a mat');
    expect(r.accuracy).toBe(1);
    expect(r.pass).toBe(true);
  });

  it('marks skipped words without shifting the rest', () => {
    const r = s.match('The cat sat on a mat.', 'the cat on a mat');
    expect(r.hits).toEqual([true, true, false, true, true, true]);
    expect(r.pass).toBe(true); // 5/6 >= 0.8
  });

  it('tolerates repeats and extra words', () => {
    const r = s.match('The pig can dig.', 'the the pig um can dig');
    expect(r.hits).toEqual([true, true, true, true]);
  });

  it('a misread word is a miss', () => {
    const r = s.match('The pig can dig.', 'the peg can dug');
    expect(r.hits).toEqual([true, false, true, false]);
    expect(r.pass).toBe(false);
  });

  it('picks the best alternative', () => {
    expect(s.matchBest('A red hen.', ['a rid hen', 'a red hen']).accuracy).toBe(1);
  });
});

describe('Grading', () => {
  it('maps tries to outcomes', () => {
    expect(outcomeFor(['match'])).toBe('first-try');
    expect(outcomeFor(['no', 'match'])).toBe('after-retry');
    expect(outcomeFor(['close'])).toBe('after-retry');
    expect(outcomeFor(['no', 'no'])).toBe('missed');
    expect(outcomeFor(['no', 'no', 'match'])).toBe('missed'); // only two tries count
  });
});

describe('MicHealth', () => {
  it('trips after two hangs in a row, resets on a good listen', () => {
    const h = new MicHealth();
    h.record('hung');
    h.record('heard');
    h.record('hung');
    expect(h.useGrownUpCheck).toBe(false);
    h.record('error');
    expect(h.useGrownUpCheck).toBe(true);
  });

  it('trips immediately when the mic is denied or missing', () => {
    const h = new MicHealth();
    h.record('denied');
    expect(h.useGrownUpCheck).toBe(true);
  });
});
