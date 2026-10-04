import type { DecodableWord, Grapheme, HeartWord, Unit } from './types';

/** Lowercase words of a sentence, punctuation stripped; possessive 's reduced to the base word. */
export function tokenize(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[^a-z']+/)
    .map((w) => w.replace(/'s$/, '').replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

const SPLIT_DIGRAPH = /^([aeiou])_e$/;

/** Rebuilds the spelling from a segmentation: ['c','a_e','k'] -> 'cake'. */
export function spell(graphemes: Grapheme[]): string {
  let out = '';
  let pendingE = false;
  for (const g of graphemes) {
    const split = SPLIT_DIGRAPH.exec(g);
    if (split) { out += split[1]; pendingE = true; continue; }
    out += g;
    if (pendingE) { out += 'e'; pendingE = false; }
  }
  return pendingE ? `${out}e` : out;
}

export interface SentenceCheck { ok: boolean; unknown: string[] }

/**
 * Decides what a child can read after unit N: words whose graphemes were all taught by N,
 * plus heart words introduced by N. Florida B.E.S.T. ELA.1.F.1.3 — decodable practice text.
 */
export class Decodability {
  private readonly byOrder: Unit[];

  constructor(units: Unit[], private readonly heart: HeartWord[]) {
    this.byOrder = [...units].sort((a, b) => a.order - b.order);
  }

  graphemesThrough(unit: number): Set<Grapheme> {
    const set = new Set<Grapheme>();
    for (const u of this.byOrder) if (u.order <= unit) u.teaches.forEach((g) => set.add(g));
    return set;
  }

  heartThrough(unit: number): Set<string> {
    return new Set(this.heart.filter((h) => h.unit <= unit).map((h) => h.text.toLowerCase()));
  }

  /** Every decodable word (cards + extras) known through `unit`, keyed by lowercase text. */
  wordsThrough(unit: number): Map<string, DecodableWord> {
    const map = new Map<string, DecodableWord>();
    for (const u of this.byOrder) {
      if (u.order > unit) break;
      for (const w of [...u.words, ...(u.extras ?? [])]) map.set(w.text.toLowerCase(), w);
    }
    return map;
  }

  /** A word is decodable at `unit` when its segmentation spells it and uses only taught graphemes. */
  isDecodable(word: DecodableWord, unit: number): boolean {
    if (spell(word.graphemes) !== word.text.toLowerCase()) return false;
    const taught = this.graphemesThrough(unit);
    return word.graphemes.every((g) => taught.has(g));
  }

  checkSentence(sentence: string, unit: number): SentenceCheck {
    const heart = this.heartThrough(unit);
    const words = this.wordsThrough(unit);
    const unknown = tokenize(sentence).filter((t) => {
      if (heart.has(t)) return false;
      const w = words.get(t);
      return !(w && this.isDecodable(w, unit));
    });
    return { ok: unknown.length === 0, unknown: [...new Set(unknown)] };
  }
}
