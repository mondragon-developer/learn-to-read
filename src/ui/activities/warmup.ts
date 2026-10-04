import type { Unit } from '@domain/content/types';
import type { WarmupGame } from '@domain/session/SessionPlanner';
import { clipKey } from '@domain/audio/AudioCatalog';
import syllableData from '@data/syllables.json';
import type { Kit } from './kit';
import { h, replace, shuffle, sleep } from '../dom';
import { soundTiles } from './wordView';

const ROUNDS = 3;

/**
 * Warm-ups. Rhyme, Blend and Clap are phonological awareness: by the B.E.S.T. clarification they
 * are oral only, so no letters appear on screen. Sound It Out is phonics, so letters are shown.
 */
export async function warmup(kit: Kit, host: HTMLElement, game: WarmupGame, unit: Unit, units: Unit[]): Promise<void> {
  const seed = (kit.ctx.clock.today() % 997) / 997;
  await kit.intro(host, game);
  if (game === 'rhyme') return rhyme(kit, host, unit, units, seed);
  if (game === 'blend') return blend(kit, host, unit, seed);
  if (game === 'syllables') return syllables(kit, host, seed);
  return soundItOut(kit, host, unit, seed);
}

async function rhyme(kit: Kit, host: HTMLElement, unit: Unit, units: Unit[], seed: number): Promise<void> {
  const fams = units.filter((u) => u.order <= unit.order).flatMap((u) => u.rhymes).filter((f) => f.length >= 2);
  const pool = units.filter((u) => u.order <= unit.order).flatMap((u) => u.words.map((w) => w.text));
  for (const [round, fam] of shuffle(fams, seed).slice(0, ROUNDS).entries()) {
    const target = fam[0] as string;
    const answer = shuffle(fam.slice(1), seed)[0] as string;
    const rime = target.slice(-2);
    const others = shuffle(pool.filter((w) => w.slice(-2) !== rime), seed).slice(0, 2);
    const options = shuffle([answer, ...others], seed + 0.1);
    const balls = options.map((_, i) => h('button', { class: 'ear', 'aria-label': `Choice ${i + 1}` }, h('span', {}, '🔊'), h('b', {}, String(i + 1))));
    const say = h('p', { class: 'coach small' }, `Which one rhymes with “${target}”? Listen to 1, 2, 3…`);
    replace(host, h('div', { class: 'stage' }, kit.header('rhyme', `Rhyme time ${round + 1} of ${ROUNDS}`), say, h('div', { class: 'row center ears' }, balls),
      h('button', { class: 'btn link', onClick: async () => { await kit.ctx.audio.sequence([clipKey.prompt('rhyme-with'), clipKey.word(target)]); for (const o of options) await kit.word(o); } }, '🔊 Hear them again')));
    balls.forEach((b) => { b.disabled = true; });
    await kit.ctx.audio.sequence([clipKey.prompt('rhyme-with'), clipKey.word(target)]);
    for (let i = 0; i < options.length; i++) {
      balls[i]?.classList.add('lit');
      await kit.word(options[i] as string);
      balls[i]?.classList.remove('lit');
      await sleep(200);
    }
    balls.forEach((b) => { b.disabled = false; });
    say.textContent = 'Now tap the one that rhymes!';
    const pick = await new Promise<number>((resolve) => balls.forEach((b, i) => b.addEventListener('click', () => resolve(i), { once: true })));
    const right = options[pick] === answer;
    if (right) await kit.prompt('goal');
    else await kit.ctx.audio.sequence([clipKey.word(target), clipKey.word(answer)], 400);
    await kit.record('warmup', `rhyme:${target}`, right ? 'first-try' : 'missed', 'tap');
  }
}

async function blend(kit: Kit, host: HTMLElement, unit: Unit, seed: number): Promise<void> {
  for (const [round, w] of shuffle(unit.words, seed).slice(0, ROUNDS).entries()) {
    const dots = w.graphemes.map(() => h('span', { class: 'dot' }));
    const panel = h('div', { class: 'panel' });
    replace(host, h('div', { class: 'stage' }, kit.header('blend', `Robot talk ${round + 1} of ${ROUNDS}`), h('div', { class: 'robot' }, '🤖'), h('div', { class: 'dots' }, dots),
      h('p', { class: 'coach small' }, 'Listen to the sounds, then say the whole word.'), panel));
    await kit.prompt('blend-it');
    for (let i = 0; i < w.graphemes.length; i++) {
      dots[i]?.classList.add('lit');
      await kit.say(clipKey.sound(w.graphemes[i] as string));
      await sleep(250);
    }
    const r = await kit.reader.readWord(panel, w.text, 'Say the word!');
    if (r.outcome !== 'missed') await kit.prompt('goal');
    await kit.record('warmup', `blend:${w.text}`, r.outcome, r.source);
  }
}

async function syllables(kit: Kit, host: HTMLElement, seed: number): Promise<void> {
  for (const [round, item] of shuffle(syllableData.words, seed).slice(0, ROUNDS).entries()) {
    let taps = 0;
    const count = h('div', { class: 'claps', 'aria-live': 'polite' });
    const drum = h('button', { class: 'drum', 'aria-label': 'Drum', onClick: () => { taps++; count.textContent = '👏'.repeat(taps); drum.classList.remove('bump'); void drum.offsetWidth; drum.classList.add('bump'); } }, '🥁');
    const again = h('button', { class: 'btn link', onClick: () => void kit.word(item.text) }, '🔊 Hear it again');
    const done = h('button', { class: 'btn big ok' }, '✓ Done');
    replace(host, h('div', { class: 'stage' }, kit.header('syllables', `Drum the parts ${round + 1} of ${ROUNDS}`), drum, count, h('div', { class: 'row center' }, again, done)));
    await kit.prompt('clap-it');
    await kit.word(item.text);
    await new Promise<void>((resolve) => done.addEventListener('click', () => resolve(), { once: true }));
    const right = taps === item.syllables;
    count.textContent = '👏'.repeat(item.syllables);
    if (right) await kit.prompt('goal');
    else await kit.word(item.text);
    await kit.record('warmup', `syllables:${item.text}`, right ? 'first-try' : 'missed', 'tap');
  }
}

async function soundItOut(kit: Kit, host: HTMLElement, unit: Unit, seed: number): Promise<void> {
  const introduced = unit.words.filter((w) => kit.known.has(`w:${w.text}`));
  const known = introduced.length ? introduced : unit.words;
  for (const [round, w] of shuffle(known, seed).slice(0, ROUNDS).entries()) {
    const card = kit.ctx.library.card(`w:${w.text}`);
    if (!card) continue;
    const tiles = soundTiles(card, kit.ctx.audio);
    const panel = h('div', { class: 'panel' });
    replace(host, h('div', { class: 'stage' }, kit.header('sound-it-out', `Sound it out ${round + 1} of ${ROUNDS}`), tiles.el, h('p', { class: 'coach small' }, 'Tap each letter, then read the word!'), panel));
    await kit.prompt('sound-it-out');
    const r = await kit.reader.readWord(panel, w.text);
    if (r.outcome !== 'missed') await kit.prompt('goal');
    await kit.record('warmup', `sound-it-out:${w.text}`, r.outcome, r.source);
  }
}
