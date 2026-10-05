import type { StorySkill } from '../content/types';
import { SKILL_BENCHMARKS } from '../standards/Standards';

export type TopicGroup = 'sounds' | 'phonics' | 'sight' | 'fluency' | 'stories' | 'vocab' | 'writing';

export type TopicId =
  | 'blend' | 'segment' | 'syllables' | 'rhyme'
  | 'phonics' | 'tricky'
  | 'heart'
  | 'fluency' | 'sentences'
  | 'story'
  | 'challenge'
  | 'spelling' | 'handwriting';

/** What the grown-up can choose in "Practice a skill", each tied to its Florida benchmarks. */
export interface Topic {
  id: TopicId;
  group: TopicGroup;
  /** Child-facing title (English). */
  title: string;
  icon: string;
  benchmarks: string[];
  /** Extra choice needed before starting. */
  needs?: 'unit' | 'skill';
  /** Kindergarten standard kept as review. */
  review?: boolean;
}

export const TOPICS: readonly Topic[] = [
  { id: 'blend', group: 'sounds', title: 'Robot talk', icon: '🤖', benchmarks: ['ELA.1.F.1.2.b', 'ELA.1.F.1.2.c'] },
  { id: 'segment', group: 'sounds', title: 'Sound boxes', icon: '🟩', benchmarks: ['ELA.1.F.1.2.a', 'ELA.1.F.1.2.d'] },
  { id: 'syllables', group: 'sounds', title: 'Drum the parts', icon: '🥁', benchmarks: ['ELA.1.F.1.2.e'] },
  { id: 'rhyme', group: 'sounds', title: 'Rhyme time', icon: '🎵', benchmarks: ['ELA.K.F.1.2.b'], review: true },
  { id: 'phonics', group: 'phonics', title: 'Phonics pattern', icon: '🔤', benchmarks: ['ELA.1.F.1.3.a', 'ELA.1.F.1.3.c', 'ELA.1.F.1.3.d', 'ELA.1.F.1.3.f'], needs: 'unit' },
  { id: 'tricky', group: 'phonics', title: 'Tricky sounds', icon: '👂', benchmarks: ['ELA.1.F.1.2'] },
  { id: 'heart', group: 'sight', title: 'Heart words', icon: '❤️', benchmarks: ['ELA.1.F.1.4.a'] },
  { id: 'fluency', group: 'fluency', title: '1-minute read', icon: '⏱️', benchmarks: ['ELA.1.F.1.4'] },
  { id: 'sentences', group: 'fluency', title: 'Reading coach', icon: '📖', benchmarks: ['ELA.1.F.1.4'] },
  { id: 'story', group: 'stories', title: 'Story time', icon: '📘', benchmarks: ['ELA.1.R.1.1', 'ELA.1.R.1.2', 'ELA.1.R.3.2.a', 'ELA.1.R.3.3'], needs: 'skill' },
  { id: 'challenge', group: 'vocab', title: 'Challenge words', icon: '🏆', benchmarks: ['ELA.1.F.1.3.e', 'ELA.1.V.1.1'] },
  { id: 'spelling', group: 'writing', title: 'Build the word', icon: '🧱', benchmarks: ['ELA.1.F.1.3.c', 'ELA.1.C.3.1'] },
  { id: 'handwriting', group: 'writing', title: 'Trace and write', icon: '✏️', benchmarks: ['ELA.1.C.1.1'] },
];

/** Story skills offered under Story time, in the order homework usually brings them. */
export const STORY_SKILLS: readonly StorySkill[] = ['sequence', 'compare', 'detail', 'time-words', 'moral', 'main-topic'];

/** A concrete choice: topic plus its unit or skill. Serialized for navigation as "phonics:5", "story:compare". */
export interface TopicChoice { topic: TopicId; unit?: number; skill?: StorySkill }

export function topic(id: TopicId): Topic {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown topic ${id}`);
  return t;
}

export function encodeChoice(c: TopicChoice): string {
  return [c.topic, c.unit ?? c.skill].filter((x) => x !== undefined).join(':');
}

export function decodeChoice(s: string): TopicChoice | null {
  const [id, arg] = s.split(':');
  const t = TOPICS.find((x) => x.id === id);
  if (!t) return null;
  if (t.needs === 'unit') { const unit = Number(arg); return Number.isInteger(unit) && unit > 0 ? { topic: t.id, unit } : null; }
  if (t.needs === 'skill') return STORY_SKILLS.includes(arg as StorySkill) ? { topic: t.id, skill: arg as StorySkill } : null;
  return { topic: t.id };
}

/** Benchmarks a concrete choice exercises (a story skill narrows Story time to its benchmark + retell). */
export function choiceBenchmarks(c: TopicChoice): string[] {
  if (c.topic === 'story' && c.skill) return [...SKILL_BENCHMARKS[c.skill], 'ELA.1.R.3.2.a'];
  return topic(c.topic).benchmarks;
}
