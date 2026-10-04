import { describe, expect, it } from 'vitest';
import { Decodability, spell, tokenize } from '../src/domain/content/Decodability';
import { HEART, UNITS } from './fixtures';

describe('spell', () => {
  it('joins plain graphemes', () => expect(spell(['sh', 'i', 'p'])).toBe('ship'));
  it('places the silent e of a split digraph after the next consonant', () => {
    expect(spell(['c', 'a_e', 'k'])).toBe('cake');
    expect(spell(['b', 'i_e', 'k', 's'])).toBe('bikes');
  });
});

describe('tokenize', () => {
  it('lowercases, strips punctuation and possessive s', () => {
    expect(tokenize("Pam's cat sat, then ran!")).toEqual(['pam', 'cat', 'sat', 'then', 'ran']);
  });
});

describe('Decodability', () => {
  const d = new Decodability(UNITS, HEART);

  it('accepts a sentence of taught words and introduced heart words', () => {
    expect(d.checkSentence('The cat sat.', 1)).toEqual({ ok: true, unknown: [] });
  });

  it('accepts extras (names) that use taught graphemes', () => {
    expect(d.checkSentence('Pam sat.', 1).ok).toBe(true);
  });

  it('rejects words not taught yet, listing each once', () => {
    const r = d.checkSentence('The pig is in the mud.', 1);
    expect(r.ok).toBe(false);
    expect(r.unknown).toEqual(['pig', 'is', 'in', 'mud']);
  });

  it('rejects a heart word before its unit', () => {
    expect(d.checkSentence('A cat is.', 1).unknown).toEqual(['is']);
  });

  it('rejects a word whose graphemes are not taught yet', () => {
    expect(d.isDecodable({ text: 'ship', graphemes: ['sh', 'i', 'p'] }, 2)).toBe(false);
    expect(d.isDecodable({ text: 'ship', graphemes: ['sh', 'i', 'p'] }, 3)).toBe(true);
  });

  it('rejects a segmentation that does not spell the word', () => {
    expect(d.isDecodable({ text: 'cat', graphemes: ['c', 'a'] }, 1)).toBe(false);
  });
});
