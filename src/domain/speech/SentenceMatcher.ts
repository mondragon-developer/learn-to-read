import { sameWord, words } from './normalize';

export interface SentenceMatch {
  /** One entry per target word: did he read it? */
  hits: boolean[];
  targetWords: string[];
  accuracy: number;
  pass: boolean;
}

/** 80% words correct counts as a read sentence, close to oral-reading-fluency accuracy goals. */
export const SENTENCE_PASS = 0.8;

/**
 * Aligns what the recognizer heard to the sentence (longest common subsequence), so skipped,
 * repeated or extra words don't shift everything after them.
 */
export class SentenceMatcher {
  match(sentence: string, heardText: string, pass = SENTENCE_PASS): SentenceMatch {
    const target = words(sentence);
    const heard = words(heardText);
    const n = target.length;
    const m = heard.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const row = dp[i] as number[];
        const next = dp[i + 1] as number[];
        row[j] = sameWord(target[i] as string, heard[j] as string)
          ? (next[j + 1] as number) + 1
          : Math.max(next[j] as number, row[j + 1] as number);
      }
    }
    const hits = new Array<boolean>(n).fill(false);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (sameWord(target[i] as string, heard[j] as string)) { hits[i] = true; i++; j++; }
      else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) i++;
      else j++;
    }
    const accuracy = n === 0 ? 0 : hits.filter(Boolean).length / n;
    return { hits, targetWords: target, accuracy, pass: accuracy >= pass };
  }

  /** Best of several recognizer alternatives. */
  matchBest(sentence: string, alternatives: string[], pass = SENTENCE_PASS): SentenceMatch {
    const results = (alternatives.length ? alternatives : ['']).map((a) => this.match(sentence, a, pass));
    return results.reduce((best, r) => (r.accuracy > best.accuracy ? r : best));
  }
}
