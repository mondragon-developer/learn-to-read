/** Text normalization shared by word and sentence matching. */

const DIGITS: Readonly<Record<string, string>> = {
  0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
};

/**
 * Words a recognizer may legitimately return for the same sounds. Reading "to" and getting "two"
 * back is a correct read, not a mistake.
 */
const HOMOPHONE_GROUPS: readonly string[][] = [
  ['to', 'two', 'too'], ['for', 'four', 'fore'], ['no', 'know'], ['there', 'their', 'theyre'],
  ['be', 'bee'], ['see', 'sea', 'c'], ['one', 'won'], ['i', 'eye', 'aye'], ['right', 'write'],
  ['by', 'buy', 'bye'], ['son', 'sun'], ['hi', 'high'], ['ate', 'eight'], ['here', 'hear'],
  ['ant', 'aunt'], ['pair', 'pear'], ['so', 'sew'], ['tail', 'tale'], ['meet', 'meat'],
  ['week', 'weak'], ['not', 'knot'], ['hole', 'whole'], ['which', 'witch'], ['blue', 'blew'],
  ['new', 'knew'], ['made', 'maid'], ['road', 'rode'], ['in', 'inn'], ['you', 'u', 'ewe'],
  ['are', 'r'], ['oh', 'o', 'owe'], ['why', 'y'], ['where', 'wear'], ['do', 'due', 'dew'],
  ['a', 'uh'],
  ['red', 'read'], ['dear', 'deer'], ['flour', 'flower'], ['our', 'hour'], ['peace', 'piece'], ['sale', 'sail'],
  ['wait', 'weight'], ['way', 'weigh'], ['tow', 'toe'], ['rows', 'rose'], ['knight', 'night'],
];
// Vowel contrasts (cat/cut, bed/bad, ship/sheep) are never listed here: telling them apart is the skill.

const HOMOPHONES = new Map<string, Set<string>>();
for (const group of HOMOPHONE_GROUPS) for (const w of group) HOMOPHONES.set(w, new Set(group));

/** Lowercase tokens; digits become number words; apostrophes dropped ("they're" -> "theyre"). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => DIGITS[t] ?? t);
}

/** Same word for reading purposes: identical, homophone, or a trailing plural "s" the recognizer added. */
export function sameWord(target: string, heard: string): boolean {
  if (target === heard) return true;
  if (HOMOPHONES.get(target)?.has(heard)) return true;
  if (target.length >= 3 && (heard === `${target}s` || `${heard}s` === target)) return true;
  return false;
}
