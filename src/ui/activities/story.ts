import type { Story } from '@domain/content/types';
import { cardId } from '@domain/content/ContentLibrary';
import { clipKey } from '@domain/audio/AudioCatalog';
import type { Kit } from './kit';
import { h, replace, shuffle, sleep } from '../dom';
import { pointAndRead } from './readAloud';
import { coachBar, coachSentence } from './readingCoach';
import { Transport } from './transport';
import { sentenceMeta, sentenceOutcome } from '@domain/reading/SentenceCheck';

/** Words missed in Read With Me that become practice cards, per story (don't flood the deck). */
const MAX_NEW_CARDS = 3;

/**
 * Story mode, shaped like his homework: hear the whole story (pointed in yellow), then the reading
 * coach sentence by sentence (assessed by the grown-up), 3 questions, a bonus (word meaning or
 * rhyme), then put three events in order.
 * ELA.1.R.1.1, R.3.2.a, R.3.3, V.1.3, F.1.4
 */
export async function story(kit: Kit, host: HTMLElement, s: Story): Promise<void> {
  await kit.intro(host, 'story');
  const lines = s.sentences.map((text) => lineView(kit, text));
  const transport = new Transport(kit.ctx.audio);
  let skipAll = false;
  const bar = coachBar(transport, () => { skipAll = true; transport.send('next'); });
  const book = h('div', { class: 'book' }, h('h2', { class: 'story-title' }, s.title), lines.map((l) => l.el));
  const panel = h('div', { class: 'panel' });
  replace(host, h('div', { class: 'stage story' }, kit.header('story', s.tier === 'decodable' ? 'You read it!' : 'Story time'), book, h('div', { class: 'coach-dock' }, panel, bar.el)));

  // 1. The whole story first, pointed in yellow (pausable, skippable).
  bar.step(0, '👂 Listen to the whole story');
  bar.replays(false, true);
  replace(panel, h('p', { class: 'coach small' }, '👆 Follow the yellow word with your finger.'));
  await kit.prompt('story-listen');
  for (let i = 0; i < lines.length && !transport.take(); i++) {
    const line = lines[i] as Line;
    line.el.classList.add('reading');
    line.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await transport.run((stopped) => pointAndRead(kit, line.words, clipKey.story(s.id, String(i)), kit.pace, stopped));
    line.el.classList.remove('reading');
  }

  // 2. Sentence by sentence: listen word by word, listen whole, his turn word by word, his turn whole.
  await kit.prompt('story-read');
  const helpedWords = new Set<string>();
  for (let i = 0; i < lines.length && !skipAll; i++) {
    const line = lines[i] as Line;
    const text = s.sentences[i] as string;
    lines.forEach((l, j) => l.el.classList.toggle('reading', j === i));
    line.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const r = await coachSentence(kit, transport, bar, line.words, panel, text, clipKey.story(s.id, String(i)));
    line.el.classList.remove('reading');
    if (!r) continue;
    if (!r.check.unverified) r.check.helped.forEach((w) => helpedWords.add((r.check.words[w] ?? '').toLowerCase()));
    await kit.record('sentence', `${s.id}:s${i}`, sentenceOutcome(r.check), r.source, sentenceMeta(r.check));
  }
  // Words he needed help with come back as practice cards (the deck ignores words already strong).
  for (const w of [...helpedWords].filter(Boolean).slice(0, MAX_NEW_CARDS)) await kit.record('story-read', cardId(w), 'missed', kit.independent ? 'mic' : 'grownup', { story: s.id });

  for (let i = 0; i < s.questions.length; i++) {
    const q = s.questions[i];
    if (!q) continue;
    const ok = await choose(kit, host, `Question ${i + 1} of ${s.questions.length}`, clipKey.story(s.id, `q${i}`), q.prompt, q.options, q.answer, (j) => clipKey.story(s.id, `q${i}o${j}`));
    await kit.record('story-question', `${s.id}:q${i}`, ok ? 'first-try' : 'missed', 'tap', { skill: q.skill });
  }
  if (s.moral) {
    const m = s.moral;
    const ok = await choose(kit, host, 'The lesson 💡', clipKey.story(s.id, 'moral'), m.prompt, m.options, m.answer, (j) => clipKey.story(s.id, `moral-o${j}`));
    await kit.record('story-question', `${s.id}:moral`, ok ? 'first-try' : 'missed', 'tap', { skill: 'moral' });
  }
  const bonusOk = await choose(kit, host, 'Bonus ⭐', clipKey.story(s.id, 'bonus'), s.bonus.prompt, s.bonus.options, s.bonus.answer, (j) => clipKey.story(s.id, `bonus-o${j}`));
  await kit.record('story-bonus', `${s.id}:bonus`, bonusOk ? 'first-try' : 'missed', 'tap', { kind: s.bonus.kind });
  const orderOk = await putInOrder(kit, host, s);
  await kit.record('story-order', `${s.id}:order`, orderOk ? 'first-try' : 'missed', 'tap');
  await retell(kit, host, s);
  if (s.reward) replace(host, h('div', { class: 'stage' }, h('div', { class: 'big-reward' }, s.reward), h('p', { class: 'coach' }, 'Great story!')));
  await sleep(1200);
}

interface Line { el: HTMLElement; words: HTMLElement[] }

function lineView(kit: Kit, text: string): Line {
  const ws = text.split(/\s+/).map((t) => h('button', { class: 'w', onClick: () => void kit.word(t.replace(/[^A-Za-z']/g, '')) }, t));
  return { el: h('p', { class: 'line' }, ws), words: ws };
}

/** A question with three answers; every answer has its own speaker so a non-reader can still answer. */
async function choose(kit: Kit, host: HTMLElement, label: string, promptKey: string, prompt: string, options: string[], answer: number, optionKey: (j: number) => string): Promise<boolean> {
  const buttons = options.map((o) => h('button', { class: 'choice' }, o));
  const rows = options.map((_, j) => h('div', { class: 'option' }, h('button', { class: 'speaker', 'aria-label': 'Hear this answer', onClick: () => void kit.say(optionKey(j)) }, '🔊'), buttons[j] as HTMLElement));
  replace(host, h('div', { class: 'stage' }, kit.header('story', label),
    h('div', { class: 'question' }, h('button', { class: 'speaker', 'aria-label': 'Hear the question', onClick: () => void kit.say(promptKey) }, '🔊'), h('span', {}, prompt)),
    h('p', { class: 'small muted' }, 'Tap 🔊 to hear an answer. Tap the answer to choose it.'),
    h('div', { class: 'options' }, rows)));
  buttons.forEach((b) => { b.disabled = true; });
  await kit.say(promptKey);
  if (kit.independent) {
    for (let j = 0; j < options.length && !kit.closed; j++) {
      buttons[j]?.classList.add('speaking');
      await kit.say(optionKey(j));
      buttons[j]?.classList.remove('speaking');
    }
    if (kit.closed) return false;
    await kit.prompt('choose-answer');
  }
  buttons.forEach((b) => { b.disabled = false; });
  const pick = await new Promise<number>((resolve) => buttons.forEach((b, j) => b.addEventListener('click', () => resolve(j), { once: true })));
  buttons.forEach((b, j) => b.classList.add(j === answer ? 'hit' : j === pick ? 'miss' : 'dim'));
  if (pick === answer) await kit.prompt('goal');
  else await kit.say(optionKey(answer));
  await sleep(600);
  return pick === answer;
}

const RETELL_PARTS = [
  { prompt: 'retell-beginning', label: 'Beginning' },
  { prompt: 'retell-middle', label: 'Middle' },
  { prompt: 'retell-end', label: 'End' },
] as const;

/**
 * Retell (ELA.1.R.3.2.a): he tells the beginning, middle and end in his own words; the grown-up
 * taps ✓ per part, or 🔊 Hint plays that part of the story (the three "put in order" sentences).
 */
async function retell(kit: Kit, host: HTMLElement, s: Story): Promise<void> {
  await kit.intro(host, 'retell');
  if (kit.independent) {
    for (const part of RETELL_PARTS) {
      const panel = h('div', { class: 'panel' });
      replace(host, h('div', { class: 'stage center' }, kit.header('retell', part.label), panel));
      await kit.reader.independentReader?.repeat(panel, () => kit.prompt(part.prompt), 'retell-done');
      kit.abort.signal.throwIfAborted();
    }
    await kit.record('retell', `${s.id}:retell`, 'unverified', 'self', { text: `${s.title}: retelling` });
    return;
  }
  let told = 0;
  for (const [i, part] of RETELL_PARTS.entries()) {
    const hintKey = clipKey.story(s.id, String(s.order[i]));
    let hinted = false;
    const yes = await new Promise<boolean>((resolve) => {
      replace(host, h('div', { class: 'stage center' }, kit.header('retell', `Tell the story: ${part.label}`, false),
        h('div', { class: 'retell-steps' }, RETELL_PARTS.map((p, j) => h('span', { class: `rstep ${j < i ? 'done' : j === i ? 'on' : ''}` }, p.label))),
        h('p', { class: 'coach' }, `What happened at the ${part.label.toLowerCase()}?`),
        h('div', { class: 'row center' },
          h('button', { class: 'btn big ok', onClick: () => resolve(!hinted) }, '✓ He told it'),
          h('button', { class: 'btn big soft', onClick: async () => { hinted = true; await kit.say(hintKey); } }, '🔊 Hint')),
        h('button', { class: 'btn link', onClick: () => resolve(false) }, 'Skip this part'),
        h('p', { class: 'small muted grownup-q' }, 'Grown-up: tap ✓ when he tells this part in his own words.')));
      void kit.prompt(part.prompt);
    });
    if (yes) told++;
  }
  await kit.record('retell', `${s.id}:retell`, told === 3 ? 'first-try' : told >= 2 ? 'after-retry' : 'missed', 'grownup', { parts: told });
}

/** Tap the three sentences in story order: first, next, last. Each strip is read aloud when tapped. */
async function putInOrder(kit: Kit, host: HTMLElement, s: Story): Promise<boolean> {
  const correct = s.order.map((i) => s.sentences[i] as string);
  const keyOf = new Map(s.order.map((i) => [s.sentences[i] as string, clipKey.story(s.id, String(i))]));
  const strips = shuffle(correct, 0.37).map((t) => h('button', { class: 'strip' }, t));
  const labels = ['First', 'Next', 'Last'];
  const placed = h('ol', { class: 'placed' });
  replace(host, h('div', { class: 'stage' }, kit.header('story', 'Put it in order'),
    h('p', { class: 'small muted' }, 'Tap what happened first, then next, then last.'), placed, h('div', { class: 'strips' }, strips.map((b) => h('div', { class: 'option' }, h('button', { class: 'speaker', 'aria-label': 'Hear this part', onClick: () => void kit.say(keyOf.get(b.textContent ?? '') ?? '') }, '🔊'), b)))));
  await kit.prompt('story-order');
  if (kit.independent) {
    strips.forEach((b) => { b.disabled = true; });
    for (const b of strips) { if (kit.closed) return false; await kit.say(keyOf.get(b.textContent ?? '') ?? ''); }
    strips.forEach((b) => { b.disabled = false; });
  }
  const chosen: string[] = [];
  await new Promise<void>((resolve) => strips.forEach((b) => b.addEventListener('click', () => {
    chosen.push(b.textContent ?? '');
    b.disabled = true;
    placed.appendChild(h('li', {}, h('b', {}, `${labels[chosen.length - 1]}: `), b.textContent ?? ''));
    void kit.say(keyOf.get(b.textContent ?? '') ?? '');
    if (chosen.length === correct.length) resolve();
  }, { once: true })));
  const ok = chosen.every((t, i) => t === correct[i]);
  if (ok) { await kit.prompt('goal'); return true; }
  replace(placed, correct.map((t, i) => h('li', { class: 'fixed' }, h('b', {}, `${labels[i]}: `), t)));
  for (let i = 0; i < s.order.length; i++) await kit.say(clipKey.story(s.id, String(s.order[i])));
  return false;
}
