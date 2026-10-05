/**
 * Content schema. Every unit, story and heart word is original text written for this app.
 * Pictures/emoji exist only as `reward` fields: Florida bans three-cueing in K-3, so nothing
 * visual may hint at a word before the child has read it.
 */
export type Locale = 'en' | 'es';

/** A sound-spelling unit the child can decode once taught: 'a', 'sh', 'ck', 'a_e', 'ee'. */
export type Grapheme = string;

export interface DecodableWord {
  text: string;
  /** Segmentation used for Sound It Out and the decodability check. 'ship' -> ['sh','i','p']. */
  graphemes: Grapheme[];
  /** Short Spanish gloss for mom (phase 2 shows it). */
  es?: string;
  /** Shown only after a correct read. */
  reward?: string;
  syllables?: number;
}

export interface HeartWord {
  text: string;
  /** Dolch list or the homework "story words" set. Dolch is public domain. */
  list: 'dolch-preprimer' | 'dolch-primer' | 'dolch-first' | 'dolch-noun' | 'story';
  /** Unit where it is introduced. */
  unit: number;
  /** Letters that do not follow taught patterns, marked with a heart in the UI ('said' -> 'ai'). */
  heartPart?: string;
  es?: string;
}

export interface Unit {
  id: string;                 // 'u01'
  order: number;              // 1-based scope position
  title: string;              // 'Short a'
  focus: string;              // child-facing one-liner spoken at unit start
  /** Graphemes newly taught in this unit (cumulative set = all earlier units + these). */
  teaches: Grapheme[];
  words: DecodableWord[];
  /** Heart word texts introduced in this unit (must exist in heartwords.json with the same unit). */
  heartWords: string[];
  /** Decodable sentences; validated against graphemes taught so far + heart words introduced so far. */
  sentences: string[];
  /** Rhyme families for warm-ups: ['cat','hat','mat','sat']. */
  rhymes: string[][];
  /** Minimal pairs for Tricky Sounds: ['cat','cut']. */
  contrasts: [string, string][];
  /** Extra decodable words allowed in sentences/stories without being practice cards (names etc.). */
  extras?: DecodableWord[];
  benchmarks: string[];
}

export type StorySkill = 'sequence' | 'compare' | 'detail' | 'time-words' | 'main-topic' | 'moral';

export interface StoryQuestion {
  prompt: string;
  options: [string, string, string];
  answer: 0 | 1 | 2;
  skill: StorySkill;
}

export interface Story {
  id: string;                 // 's01'
  title: string;
  /** decodable: he reads it alone (validated). readalong: homework-level, app reads first. */
  tier: 'decodable' | 'readalong';
  /** Earliest unit after which the story is offered (decodable tier is validated at this unit). */
  unit: number;
  skill: StorySkill;
  sentences: string[];
  questions: [StoryQuestion, StoryQuestion, StoryQuestion];
  bonus: { kind: 'meaning' | 'rhyme'; prompt: string; options: string[]; answer: number };
  /** Optional "what lesson…?" question for stories that have a moral (ELA.1.R.1.2). Many stories don't. */
  moral?: StoryQuestion;
  /** Three sentence indexes, in story order, for the Put It In Order step. */
  order: [number, number, number];
  reward?: string;
  benchmarks: string[];
}

export interface HeartWordFile { words: HeartWord[] }

/**
 * Grade-level word from his homework topics, taught whole and split into syllables
 * (ro·bin). One per day in 10/15-minute sessions. ELA.1.F.1.3.e, ELA.1.V.1.1
 */
export interface ChallengeWord {
  text: string;
  syllables: string[];
  es?: string;
  reward?: string;
  topic: string;
}

export interface ChallengeFile { words: ChallengeWord[] }
