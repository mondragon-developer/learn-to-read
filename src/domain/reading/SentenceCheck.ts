import type { Outcome } from '../storage/events';

/**
 * One sentence of the reading coach, as the grown-up assessed it:
 * word by word (which words he read without help) and then the whole sentence.
 */
export interface SentenceCheck {
  text: string;
  /** Words with letters, in order. */
  words: string[];
  /** Indexes of words he needed help with in the word-by-word turn. */
  helped: number[];
  /** Whole-sentence turn judged right. */
  whole: boolean;
}

export function wordsRead(c: SentenceCheck): number { return c.words.length - c.helped.length; }

/**
 * Event outcome for a checked sentence:
 * every word alone + the whole sentence -> first-try; the whole sentence or 80% of the words -> after-retry.
 */
export function sentenceOutcome(c: SentenceCheck): Outcome {
  const share = c.words.length ? wordsRead(c) / c.words.length : 0;
  if (c.whole && c.helped.length === 0) return 'first-try';
  if (c.whole || share >= 0.8) return 'after-retry';
  return 'missed';
}

/** Event meta for the dashboard (kept flat: events carry scalars only). */
export function sentenceMeta(c: SentenceCheck): Record<string, string | number | boolean> {
  return { text: c.text, words: c.words.length, wordsRead: wordsRead(c), whole: c.whole, helped: c.helped.map((i) => c.words[i]).join(' ') };
}
