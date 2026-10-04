import type { ContentSource } from '../src/domain/content/ContentLibrary';
import type { HeartWord, Story, Unit } from '../src/domain/content/types';
import { EVENT_SCHEMA, type Activity, type Outcome, type PracticeEvent } from '../src/domain/storage/events';

const w = (text: string, graphemes: string[]) => ({ text, graphemes });

export const UNITS: Unit[] = [
  {
    id: 'u01', order: 1, title: 'Short a', focus: 'a says /a/', teaches: ['m', 's', 't', 'a', 'p', 'c', 'n'],
    words: [w('cat', ['c', 'a', 't']), w('map', ['m', 'a', 'p']), w('sat', ['s', 'a', 't']), w('pan', ['p', 'a', 'n']), w('man', ['m', 'a', 'n'])],
    heartWords: ['the', 'a'],
    sentences: ['The cat sat.', 'A man sat.'],
    rhymes: [['cat', 'sat', 'mat']], contrasts: [], extras: [w('Pam', ['p', 'a', 'm'])], benchmarks: ['ELA.1.F.1.3.c'],
  },
  {
    id: 'u02', order: 2, title: 'Short i', focus: 'i says /i/', teaches: ['i', 'd', 'g'],
    words: [w('sit', ['s', 'i', 't']), w('dig', ['d', 'i', 'g']), w('pig', ['p', 'i', 'g'])],
    heartWords: ['is'],
    sentences: ['The pig is in the mud.'],
    rhymes: [['pig', 'dig']], contrasts: [['sit', 'sat']], benchmarks: ['ELA.1.F.1.3.c'],
  },
  {
    id: 'u03', order: 3, title: 'sh', focus: 'sh', teaches: ['sh'],
    words: [w('ship', ['sh', 'i', 'p'])], heartWords: [], sentences: [], rhymes: [], contrasts: [], benchmarks: ['ELA.1.F.1.3.a'],
  },
];

export const HEART: HeartWord[] = [
  { text: 'the', list: 'dolch-preprimer', unit: 1, heartPart: 'e' },
  { text: 'a', list: 'dolch-preprimer', unit: 1 },
  { text: 'is', list: 'dolch-preprimer', unit: 2, heartPart: 's' },
];

const story = (id: string, unit: number, tier: Story['tier'], skill: Story['skill']): Story => ({
  id, title: id, tier, unit, skill,
  sentences: ['The cat sat.', 'A man sat.', 'Pam sat.'],
  questions: [
    { prompt: 'Who sat first?', options: ['the cat', 'a man', 'Pam'], answer: 0, skill },
    { prompt: 'Who sat next?', options: ['the cat', 'a man', 'Pam'], answer: 1, skill },
    { prompt: 'Who sat last?', options: ['the cat', 'a man', 'Pam'], answer: 2, skill },
  ],
  bonus: { kind: 'rhyme', prompt: 'Which rhymes with cat?', options: ['sat', 'man'], answer: 0 },
  order: [0, 1, 2], benchmarks: ['ELA.1.R.1.1'],
});

export const STORIES: Story[] = [story('s01', 1, 'decodable', 'sequence'), story('s02', 1, 'readalong', 'compare'), story('s03', 2, 'readalong', 'sequence')];

export const CHALLENGE = [
  { text: 'robin', syllables: ['rob', 'in'], topic: 'nature' },
  { text: 'water', syllables: ['wa', 'ter'], topic: 'nature' },
  { text: 'cat', syllables: ['cat'], topic: 'dup' }, // already a unit card: ignored as a challenge
];

export const SOURCE: ContentSource = { units: () => UNITS, heartWords: () => HEART, stories: () => STORIES, challengeWords: () => CHALLENGE };

let seq = 0;
export function ev(activity: Activity, itemId: string, day: number, outcome: Outcome = 'first-try', extra: Partial<PracticeEvent> = {}): PracticeEvent {
  seq++;
  return { v: EVENT_SCHEMA, id: `e${String(seq).padStart(5, '0')}`, profileId: 'p1', at: day * 86_400_000 + seq, day, activity, itemId, outcome, source: 'mic', ...extra };
}
