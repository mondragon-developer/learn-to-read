import type { ContentLibrary } from '../content/ContentLibrary';
import { tokenize } from '../content/Decodability';

/**
 * Every clip the app can play, derived from content. The generator script turns this list into
 * MP3s; at runtime a clip with no file falls back to the device voice with the same text.
 */
export type ClipKind = 'word' | 'slow' | 'sound' | 'sentence' | 'story' | 'prompt';

export interface Clip {
  key: string;          // 'word:cat', 'sound:sh', 'sentence:u01:0', 'story:s01:3', 'prompt:goal'
  kind: ClipKind;
  /** What the clip should say (the text we display, or the prompt). */
  text: string;
  /** What we send to the TTS voice when it differs from `text` (isolated sounds need spelled hints). */
  ttsText: string;
  /** Path under /public. */
  file: string;
  /** Speaking rate for the TTS (1 = normal). Early readers need words a bit slower. */
  speed: number;
}

/**
 * Spelled hints for isolated sounds. TTS voices read single letters as letter names ("tee"),
 * so continuous sounds are stretched ("mmm") and stop sounds get the shortest vowel ("tuh").
 * Bad ones get fixed in the Audio Review screen (new hint or a recorded override).
 */
export const SOUND_HINTS: Readonly<Record<string, string>> = {
  a: 'aah, as in apple', e: 'eh', i: 'ih', o: 'aw', u: 'uh',
  m: 'mmm', s: 'sss', f: 'fff', n: 'nnn', l: 'lll', r: 'rrr', v: 'vvv', z: 'zzz', h: 'hhh',
  t: 'tuh', p: 'puh', c: 'kuh', k: 'kuh', d: 'duh', b: 'buh', g: 'guh', j: 'juh', w: 'wuh', y: 'yuh', x: 'ks',
  sh: 'shhh', th: 'thhh', ch: 'chuh', tch: 'chuh', ck: 'kuh', wh: 'wuh', ng: 'ng', nk: 'nk',
  a_e: 'ay', i_e: 'eye', o_e: 'oh', u_e: 'you', ed: 'd', ing: 'ing',
};

export const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const WORD_SPEED = 0.85;
/** Sentences and stories are read slowly enough to follow word by word with a finger. */
const SENTENCE_SPEED = 0.8;
const SOUND_SPEED = 0.8;
const SLOW_SPEED = 0.6;

export const clipKey = {
  word: (text: string) => `word:${text.toLowerCase()}`,
  /** Long words said slowly, part by part (a separate clip: slowing playback would drop the pitch). */
  slow: (text: string) => `slow:${text.toLowerCase()}`,
  sound: (g: string) => `sound:${g}`,
  sentence: (unitId: string, i: number) => `sentence:${unitId}:${i}`,
  story: (storyId: string, part: string) => `story:${storyId}:${part}`,
  prompt: (id: string) => `prompt:${id}`,
};

export function buildCatalog(library: ContentLibrary, prompts: Record<string, string>, spokenOnly: string[] = []): Clip[] {
  const clips = new Map<string, Clip>();
  const add = (c: Clip): void => { if (!clips.has(c.key)) clips.set(c.key, c); };
  const word = (text: string): void => {
    const t = text.toLowerCase() === 'i' ? 'I' : text;
    add({ key: clipKey.word(t), kind: 'word', text: t, ttsText: t, file: `audio/words/${slug(t)}.mp3`, speed: WORD_SPEED });
  };

  for (const u of library.units) {
    for (const g of u.teaches) add({ key: clipKey.sound(g), kind: 'sound', text: g, ttsText: SOUND_HINTS[g] ?? g, file: `audio/sounds/${slug(g)}.mp3`, speed: SOUND_SPEED });
    for (const w of [...u.words, ...(u.extras ?? [])]) word(w.text);
    u.heartWords.forEach(word);
    u.sentences.forEach((s, i) => {
      add({ key: clipKey.sentence(u.id, i), kind: 'sentence', text: s, ttsText: s, file: `audio/sentences/${u.id}-${i}.mp3`, speed: SENTENCE_SPEED });
      tokenize(s).forEach(word);
    });
    u.rhymes.flat().forEach(word);
    u.contrasts.flat().forEach(word);
  }

  for (const id of library.challengeOrder) {
    const c = library.card(id);
    if (!c) continue;
    word(c.text);
    add({ key: clipKey.slow(c.text), kind: 'slow', text: c.text, ttsText: c.text, file: `audio/slow/${slug(c.text)}.mp3`, speed: SLOW_SPEED });
  }

  for (const s of library.stories) {
    const part = (p: string, text: string): void =>
      add({ key: clipKey.story(s.id, p), kind: 'story', text, ttsText: text, file: `audio/stories/${s.id}-${p}.mp3`, speed: SENTENCE_SPEED });
    part('title', s.title);
    s.sentences.forEach((line, i) => { part(String(i), line); tokenize(line).forEach(word); });
    s.questions.forEach((q, i) => {
      part(`q${i}`, q.prompt);
      q.options.forEach((o, j) => part(`q${i}o${j}`, o));
    });
    part('bonus', s.bonus.prompt);
    s.bonus.options.forEach((o, j) => part(`bonus-o${j}`, o));
  }

  spokenOnly.forEach(word);

  for (const [id, text] of Object.entries(prompts)) {
    add({ key: clipKey.prompt(id), kind: 'prompt', text, ttsText: text, file: `audio/prompts/${id}.mp3`, speed: 1 });
  }
  return [...clips.values()];
}
