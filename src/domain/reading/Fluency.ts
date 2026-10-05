/**
 * One-minute oral reading (ELA.1.F.1.4): words correct per minute against the grade-1 norms that
 * B.E.S.T. Appendix E reprints (Hasbrouck & Tindal 2017). There is no fall norm for grade 1.
 */
export type Season = 'fall' | 'winter' | 'spring';

/** Grade 1 WCPM by percentile. */
export const GRADE1_NORMS: Readonly<Record<'winter' | 'spring', Readonly<Record<10 | 25 | 50 | 75 | 90, number>>>> = {
  winter: { 10: 9, 25: 16, 50: 29, 75: 59, 90: 97 },
  spring: { 10: 18, 25: 34, 50: 60, 75: 91, 90: 116 },
};

export interface FluencyRead {
  /** Words he got to (the last word read, 1-based). */
  words: number;
  errors: number;
  seconds: number;
}

export function wcpm(r: FluencyRead): number {
  if (r.seconds <= 0) return 0;
  return Math.max(0, Math.round(((r.words - r.errors) * 60) / r.seconds));
}

export function accuracy(r: FluencyRead): number {
  return r.words ? Math.max(0, (r.words - r.errors) / r.words) : 0;
}

/** School-year season from a date: fall Aug–Nov, winter Dec–Feb, spring Mar–Jul. */
export function seasonOf(date: Date): Season {
  const m = date.getMonth(); // 0 = Jan
  if (m >= 7 && m <= 10) return 'fall';
  if (m === 11 || m <= 1) return 'winter';
  return 'spring';
}

/**
 * The norm a read is compared with: winter in the fall (there is no fall norm, winter is the next
 * checkpoint), otherwise the current season.
 */
export function normFor(season: Season): { season: 'winter' | 'spring'; target: number; table: Readonly<Record<10 | 25 | 50 | 75 | 90, number>> } {
  const s = season === 'spring' ? 'spring' : 'winter';
  return { season: s, target: GRADE1_NORMS[s][50], table: GRADE1_NORMS[s] };
}

/** Highest norm percentile reached (0 = below the 10th). */
export function percentileBand(value: number, table: Readonly<Record<10 | 25 | 50 | 75 | 90, number>>): 0 | 10 | 25 | 50 | 75 | 90 {
  const bands = [90, 75, 50, 25, 10] as const;
  return bands.find((p) => value >= table[p]) ?? 0;
}
