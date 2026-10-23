import { listenWord } from './listenWord';
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
  const guided = kit.profile.settings.storyReading === 'coach';
  let skipReading = false;
  const helpedWords = new Set<string>();
  // Guided reading retains the full-story model. Simple mode starts with the child's sentence.
  if (guided) await kit.part(host, async (part, target) => {
    const lines = s.sentences.map((text) => lineView(part, text));
    const transport = new Transport(part.ctx.audio);
    const bar = coachBar(transport, () => { skipReading = true; part.cancel(); });
    bar.step(0, '👂 Listen to the whole story');
    bar.replays(false, true);
    replace(target, h('div', { class: 'stage story' }, part.header('story'),
      h('div', { class: 'book' }, h('h2', { class: 'story-title' }, s.title), lines.map((l) => l.el)), bar.el));
    await part.prompt('story-listen');
    for (let i = 0; i < lines.length && !part.closed && !transport.take(); i++) {
      const line = lines[i] as Line;
      line.el.classList.add('reading');
      await transport.run((stopped) => pointAndRead(part, line.words, clipKey.story(s.id, String(i)), part.pace, () => part.closed || stopped()));
      line.el.classList.remove('reading');
    }
  });

  for (let i = 0; i < s.sentences.length && !skipReading && !kit.closed; i++) {
    await kit.part(host, async (part, target) => {
      const text = s.sentences[i] as string;
      const key = clipKey.story(s.id, String(i));
      const line = lineView(part, text);
      const panel = h('div', { class: 'panel' });
      const transport = new Transport(part.ctx.audio);
      const bar = coachBar(transport, () => { skipReading = true; part.cancel(); });
      replace(target, h('div', { class: 'stage story' }, part.header('story', `Sentence ${i + 1} of ${s.sentences.length}`),
        h('div', { class: 'book' }, h('h2', { class: 'story-title' }, s.title), line.el),
        h('div', { class: 'coach-dock' }, panel, guided ? bar.el : null)));
      if (!guided) {
        await new Promise<void>((resolve) => replace(panel,
          h('p', { class: 'coach' }, 'Read out loud. Tap below a word to hear it. Then Continue.'),
          h('button', { class: 'btn big ok read-continue', onClick: () => { part.ctx.audio.stop(); resolve(); } }, 'Continue →'),
          h('button', { class: 'btn soft', onClick: () => void pointAndRead(part, line.words, key, 'follow', () => part.closed) }, '🔊 Hear the sentence'),
          h('button', { class: 'btn link', onClick: () => { skipReading = true; part.cancel(); } }, 'Skip to questions')));
        await part.record('sentence', `${s.id}:s${i}`, 'unverified', 'self', { text, words: text.split(/\s+/).length, wordsRead: 0, whole: false });
      } else {
        const r = await coachSentence(part, transport, bar, line.words, panel, text, key);
        if (!r || part.closed) return;
        if (!r.check.unverified) r.check.helped.forEach((w) => helpedWords.add((r.check.words[w] ?? '').toLowerCase()));
        await part.record('sentence', `${s.id}:s${i}`, sentenceOutcome(r.check), r.source, sentenceMeta(r.check));
      }
    });
  }
  for (const w of [...helpedWords].filter(Boolean).slice(0, MAX_NEW_CARDS)) await kit.record('story-read', cardId(w), 'missed', kit.independent ? 'mic' : 'grownup', { story: s.id });
  await storyActivities(kit, host, s);
}

/** Optional activities shared by lesson stories and the standalone story shelf. */
export async function storyActivities(kit: Kit, host: HTMLElement, s: Story): Promise<void> {

  for (let i = 0; i < s.questions.length; i++) {
    const q = s.questions[i];
    if (!q) continue;
    await kit.part(host, async (part, target) => {
      const ok = await choose(part, target, `Question ${i + 1} of ${s.questions.length}`, clipKey.story(s.id, `q${i}`), q.prompt, q.options, q.answer, (j) => clipKey.story(s.id, `q${i}o${j}`));
      await part.record('story-question', `${s.id}:q${i}`, ok ? 'first-try' : 'missed', 'tap', { skill: q.skill });
    });
  }
  if (s.moral) {
    const m = s.moral;
    await kit.part(host, async (part, target) => {
      const ok = await choose(part, target, 'The lesson 💡', clipKey.story(s.id, 'moral'), m.prompt, m.options, m.answer, (j) => clipKey.story(s.id, `moral-o${j}`));
      await part.record('story-question', `${s.id}:moral`, ok ? 'first-try' : 'missed', 'tap', { skill: 'moral' });
    });
  }
  await kit.part(host, async (part, target) => {
    const ok = await choose(part, target, 'Bonus ⭐', clipKey.story(s.id, 'bonus'), s.bonus.prompt, s.bonus.options, s.bonus.answer, (j) => clipKey.story(s.id, `bonus-o${j}`));
    await part.record('story-bonus', `${s.id}:bonus`, ok ? 'first-try' : 'missed', 'tap', { kind: s.bonus.kind });
  });
  await kit.part(host, async (part, target) => {
    const ok = await putInOrder(part, target, s);
    await part.record('story-order', `${s.id}:order`, ok ? 'first-try' : 'missed', 'tap');
  });
  await retell(kit, host, s);
  if (kit.closed) return;
  if (s.reward) replace(host, h('div', { class: 'stage' }, h('div', { class: 'big-reward' }, s.reward), h('p', { class: 'coach' }, 'Great story!')));
  await sleep(1200);
}

interface Line { el: HTMLElement; words: HTMLElement[] }

function lineView(kit: Kit, text: string): Line {
  const ws = text.split(/\s+/).map((t) => listenWord(kit, t, 'w'));
  return { el: h('p', { class: 'line' }, ws), words: ws };
}

/** A question with three answers; every answer has its own speaker so a non-reader can still answer. */
async function choose(kit: Kit, host: HTMLElement, label: string, promptKey: string, prompt: string, options: string[], answer: number, optionKey: (j: number) => string): Promise<boolean> {
  const buttons = options.map((o) => h('button', { class: 'choice' }, o));
  const rows = options.map((_, j) => h('div', { class: 'option' }, h('button', { class: 'speaker', 'aria-label': 'Hear this answer', onClick: () => { kit.narrate((voice) => voice.say(optionKey(j))); } }, '🔊'), buttons[j] as HTMLElement));
  replace(host, h('div', { class: 'stage' }, kit.header('story', label),
    h('div', { class: 'question' }, h('button', { class: 'speaker', 'aria-label': 'Hear the question', onClick: () => { kit.narrate((voice) => voice.say(promptKey)); } }, '🔊'), h('span', {}, prompt)),
    h('p', { class: 'small muted' }, 'Tap 🔊 to hear an answer. Tap the answer to choose it.'),
    h('div', { class: 'options' }, rows)));
  const pick = await kit.respond(async (voice) => {
    await voice.say(promptKey);
    if (kit.independent) {
      for (let j = 0; j < options.length && !voice.closed; j++) {
        buttons[j]?.classList.add('speaking');
        await voice.say(optionKey(j));
        buttons[j]?.classList.remove('speaking');
      }
      await voice.prompt('choose-answer');
    }
  }, new Promise<number>((resolve) => buttons.forEach((b, j) => b.addEventListener('click', () => resolve(j), { once: true }))));
  buttons.forEach((b, j) => b.classList.add(j === answer ? 'hit' : j === pick ? 'miss' : 'dim'));
  await kit.feedback(host, (voice) => pick === answer ? voice.prompt('goal') : voice.say(optionKey(answer)));
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
  let told = 0;
  let completed = 0;
  for (const [i, item] of RETELL_PARTS.entries()) {
    const result = await kit.part(host, async (part, target) => {
      if (part.independent) {
        const panel = h('div', { class: 'panel' });
        replace(target, h('div', { class: 'stage center' }, part.header('retell', item.label), panel));
        await part.reader.independentReader?.repeat(panel, () => part.prompt(item.prompt), 'retell-done');
        return true;
      }
      let hinted = false;
      return new Promise<boolean>((resolve) => {
        replace(target, h('div', { class: 'stage center' }, part.header('retell', `Tell the story: ${item.label}`, false),
          h('p', { class: 'coach' }, `What happened at the ${item.label.toLowerCase()}?`),
          h('div', { class: 'row center' },
            h('button', { class: 'btn big ok', onClick: () => resolve(!hinted) }, '✓ He told it'),
            h('button', { class: 'btn big soft', onClick: () => { hinted = true; void part.say(clipKey.story(s.id, String(s.order[i]))); } }, '🔊 Hint'))));
        void part.prompt(item.prompt);
      });
    });
    if (result !== null) { completed++; if (result) told++; }
  }
  // Partial retellings are practice only; skipped parts must not become failures.
  if (completed) await kit.record('retell', `${s.id}:retell`, kit.independent || completed < 3 ? 'unverified' : told === 3 ? 'first-try' : told >= 2 ? 'after-retry' : 'missed', kit.independent ? 'self' : 'grownup', { parts: told, completed, text: `${s.title}: retelling` });
}

/** Tap the three sentences in story order: first, next, last. Each strip is read aloud when tapped. */
async function putInOrder(kit: Kit, host: HTMLElement, s: Story): Promise<boolean> {
  const correct = s.order.map((i) => s.sentences[i] as string);
  const keyOf = new Map(s.order.map((i) => [s.sentences[i] as string, clipKey.story(s.id, String(i))]));
  const strips = shuffle(correct, 0.37).map((t) => h('button', { class: 'strip' }, t));
  const labels = ['First', 'Next', 'Last'];
  const placed = h('ol', { class: 'placed' });
  replace(host, h('div', { class: 'stage' }, kit.header('story', 'Put it in order'),
    h('p', { class: 'small muted' }, 'Tap what happened first, then next, then last.'), placed, h('div', { class: 'strips' }, strips.map((b) => h('div', { class: 'option' }, h('button', { class: 'speaker', 'aria-label': 'Hear this part', onClick: () => { kit.narrate((voice) => voice.say(keyOf.get(b.textContent ?? '') ?? '')); } }, '🔊'), b)))));
  const chosen: string[] = [];
  await kit.respond(async (voice) => {
    await voice.prompt('story-order');
    if (kit.independent) for (const b of strips) {
      if (voice.closed) break;
      await voice.say(keyOf.get(b.textContent ?? '') ?? '');
    }
  }, new Promise<void>((resolve) => strips.forEach((b) => b.addEventListener('click', () => {
    chosen.push(b.textContent ?? '');
    b.disabled = true;
    placed.appendChild(h('li', {}, h('b', {}, `${labels[chosen.length - 1]}: `), b.textContent ?? ''));
    kit.narrate((voice) => voice.say(keyOf.get(b.textContent ?? '') ?? ''));
    if (chosen.length === correct.length) resolve();
  }, { once: true }))));
  const ok = chosen.every((t, i) => t === correct[i]);
  if (ok) { await kit.prompt('goal'); return true; }
  replace(placed, correct.map((t, i) => h('li', { class: 'fixed' }, h('b', {}, `${labels[i]}: `), t)));
  await kit.feedback(host, async (voice) => {
    for (let i = 0; i < s.order.length && !voice.closed; i++) await voice.say(clipKey.story(s.id, String(s.order[i])));
  });
  return false;
}
