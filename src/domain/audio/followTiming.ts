/**
 * Estimates when each word starts inside a spoken sentence of known duration, for pointing at
 * words while a clip plays. Longer words take longer; punctuation adds a pause after the word.
 */
export function wordStartTimes(words: string[], durationMs: number): number[] {
  const LEAD = 0.06;   // share of the clip before the first word
  const TAIL = 0.06;   // share after the last word
  const weight = (w: string): number => {
    const letters = w.replace(/[^A-Za-z]/g, '').length;
    const pause = /[.!?]["”]?$/.test(w) ? 3 : /[,;:]$/.test(w) ? 2 : 0;
    return 2 + letters + pause; // the 2 is the per-word onset cost (short words still take time)
  };
  const weights = words.map(weight);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const usable = durationMs * (1 - LEAD - TAIL);
  const starts: number[] = [];
  let t = durationMs * LEAD;
  for (const w of weights) {
    starts.push(Math.round(t));
    t += (w / total) * usable;
  }
  return starts;
}

/** Index of the word that contains character `charIndex` of the joined sentence (speech boundary events). */
export function wordAtChar(words: string[], charIndex: number): number {
  let pos = 0;
  for (let i = 0; i < words.length; i++) {
    const end = pos + (words[i]?.length ?? 0);
    if (charIndex < end + 1) return i;
    pos = end + 1; // the joining space
  }
  return words.length - 1;
}
