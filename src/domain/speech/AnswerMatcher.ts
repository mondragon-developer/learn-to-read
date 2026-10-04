import { sameWord, words } from './normalize';

export type MatchLevel = 'match' | 'close' | 'no';

export interface WordMatch {
  level: MatchLevel;
  /** Best transcript, for the parent dashboard ("he said: cut"). */
  heard: string;
  /** For 'close': which sound to model again ('th', 'sh', 'v'...). */
  hint?: string;
}

/**
 * Sound swaps typical for a Spanish-English bilingual child. Reading "the" as "da" means he
 * decoded the word but the sound needs work: we say "So close!" and model it, we don't call it wrong.
 * Vowel swaps are deliberately absent: cat -> cut is a decoding miss, the core skill being taught.
 */
const CLOSE_SWAPS: readonly [from: string, to: string][] = [
  ['th', 'd'], ['th', 't'], ['th', 'f'], ['sh', 'ch'], ['ch', 'sh'], ['v', 'b'], ['b', 'v'], ['j', 'y'], ['y', 'j'],
];

/** How recognizers spell those swaps for common words ("the" read as /da/ comes back as "da" or "duh"). */
const CLOSE_SPELLINGS: Readonly<Record<string, { heard: readonly string[]; hint: string }>> = {
  the: { heard: ['da', 'duh', 'de', 'dah'], hint: 'th' },
  this: { heard: ['dis', 'deese'], hint: 'th' },
  that: { heard: ['dat'], hint: 'th' },
  them: { heard: ['dem'], hint: 'th' },
  they: { heard: ['day', 'dey'], hint: 'th' },
  with: { heard: ['wit', 'wif'], hint: 'th' },
  three: { heard: ['tree', 'free'], hint: 'th' },
  thank: { heard: ['tank', 'fank'], hint: 'th' },
  think: { heard: ['tink', 'fink'], hint: 'th' },
};

/** Phrases longer than this are not a single-word read ("I want the cat" when the card says "cat"). */
const MAX_TOKENS_FOR_WORD = 3;

export class AnswerMatcher {
  /** Grades a single-word read against the recognizer's alternatives (best first). */
  matchWord(target: string, alternatives: string[]): WordMatch {
    const t = words(target)[0] ?? target.toLowerCase();
    const heard = alternatives[0]?.trim() ?? '';
    const tokenLists = alternatives.map(words).filter((ws) => ws.length > 0 && ws.length <= MAX_TOKENS_FOR_WORD);

    if (tokenLists.some((ws) => ws.some((w) => sameWord(t, w)))) return { level: 'match', heard };

    const spelled = CLOSE_SPELLINGS[t];
    if (spelled && tokenLists.some((ws) => ws.some((w) => spelled.heard.includes(w)))) return { level: 'close', heard, hint: spelled.hint };

    for (const [from, to] of CLOSE_SWAPS) {
      if (!t.includes(from)) continue;
      const variant = t.replace(from, to);
      if (tokenLists.some((ws) => ws.includes(variant))) return { level: 'close', heard, hint: from };
    }
    return { level: 'no', heard };
  }
}
