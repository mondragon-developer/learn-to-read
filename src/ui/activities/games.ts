import type { Unit } from '@domain/content/types';
import { clipKey } from '@domain/audio/AudioCatalog';
import type { Kit } from './kit';
import { h, replace, shuffle } from '../dom';
import { tiles } from './write';

/**
 * Tricky Sounds: hear one word of a minimal pair, tap which one. Built for a Spanish-English
 * bilingual ear: short vowels, sh/s, th/t, final consonants.
 */
export async function tricky(kit: Kit, host: HTMLElement, unit: Unit, units: Unit[]): Promise<void> {
  const pairs = units.filter((u) => u.order <= unit.order).flatMap((u) => u.contrasts);
  const seed = (kit.ctx.clock.today() % 991) / 991;
  await kit.intro(host, 'tricky');
  const rounds = shuffle(pairs, seed).slice(0, 4);
  for (const [round, [a, b]] of rounds.entries()) {
    const said = Math.random() < 0.5 ? a : b;
    const options = shuffle([a, b]);
    const buttons = options.map((w) => h('button', { class: 'choice word-choice' }, w));
    replace(host, h('div', { class: 'stage' }, kit.header('tricky', `Tricky sounds ${round + 1} of ${rounds.length}`),
      h('p', { class: 'coach small' }, 'Which word did you hear?'),
      h('button', { class: 'btn link', onClick: () => void kit.word(said) }, '🔊 Hear it again'),
      h('div', { class: 'row center' }, buttons)));
    await kit.prompt('tricky');
    await kit.word(said);
    const pick = await new Promise<number>((resolve) => buttons.forEach((btn, i) => btn.addEventListener('click', () => resolve(i), { once: true })));
    const right = options[pick] === said;
    buttons.forEach((btn, i) => btn.classList.add(options[i] === said ? 'hit' : 'dim'));
    if (right) await kit.prompt('goal');
    else await kit.ctx.audio.sequence([clipKey.word(a), clipKey.word(b)], 500);
    await kit.record('tricky', `tricky:${a}/${b}`, right ? 'first-try' : 'missed', 'tap', { said });
  }
}

/** Spelling round with letter tiles on words he already met (encoding, ELA.1.F.1.3.c). */
export async function spelling(kit: Kit, host: HTMLElement, unit: Unit): Promise<void> {
  const seen = unit.words.map((w) => kit.ctx.library.card(`w:${w.text}`)).filter((c) => !!c && kit.known.has(c.id));
  for (const card of shuffle(seen).slice(0, 3)) {
    if (!card) continue;
    const outcome = await tiles(kit, host, card);
    await kit.record('write', card.id, outcome, 'tiles', { mode: 'tiles', game: true });
  }
}
