/** Every activity's name and icon. The spoken child instruction is prompt `howto-<id>`; the grown-up note is i18n `howto.<id>`. */
export type HowToId =
  | 'rhyme' | 'blend' | 'segment' | 'syllables' | 'sound-it-out'
  | 'review' | 'new-word' | 'challenge' | 'sentence' | 'story'
  | 'trace' | 'free' | 'tiles' | 'tricky'
  | 'fluency' | 'retell';

export const HOWTO: Readonly<Record<HowToId, { icon: string; title: string }>> = {
  rhyme: { icon: '🎵', title: 'Rhyme time' },
  blend: { icon: '🤖', title: 'Robot talk' },
  segment: { icon: '🟩', title: 'Sound boxes' },
  syllables: { icon: '🥁', title: 'Drum the parts' },
  'sound-it-out': { icon: '🧩', title: 'Sound it out' },
  review: { icon: '🔁', title: 'Word review' },
  'new-word': { icon: '⭐', title: 'New word' },
  challenge: { icon: '🏆', title: 'Challenge word' },
  sentence: { icon: '📖', title: 'Read a sentence' },
  story: { icon: '📘', title: 'Story time' },
  trace: { icon: '✏️', title: 'Trace the word' },
  free: { icon: '✍️', title: 'Write it' },
  tiles: { icon: '🧱', title: 'Build the word' },
  tricky: { icon: '👂', title: 'Tricky sounds' },
  fluency: { icon: '⏱️', title: 'One-minute read' },
  retell: { icon: '🗣️', title: 'Tell the story' },
};
