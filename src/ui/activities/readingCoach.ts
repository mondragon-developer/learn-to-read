import type { SentenceCheck } from '@domain/reading/SentenceCheck';
import type { Source } from '@domain/storage/events';
import type { Kit } from './kit';
import { h, replace } from '../dom';
import { paintHits, pointAndRead } from './readAloud';
import { Transport, type Command } from './transport';

/** The four steps of one sentence: I read (slow), I read (whole), you read (word by word), you read (whole). */
const STEPS = [
  { icon: '🐢', label: 'Listen: word by word' },
  { icon: '🐇', label: 'Listen: all at once' },
  { icon: '👦', label: 'Your turn: word by word' },
  { icon: '👦', label: 'Your turn: the whole sentence' },
] as const;

export interface CoachBar {
  el: HTMLElement;
  /** Shows step 1-4 (or a custom label, e.g. "Listen to the whole story"). */
  step(n: number, custom?: string): void;
  /** Replay buttons hide while the child records; pause only shows while the app is reading. */
  replays(visible: boolean, pauseVisible?: boolean): void;
}

/**
 * Sticky control bar: step label + dots, ⏸/▶, 🐢 word by word again, 🐇 all at once again,
 * ⏭ next. `onSkipAll` adds "Skip to questions" (story mode).
 */
export function coachBar(t: Transport, onSkipAll?: () => void): CoachBar {
  const label = h('div', { class: 'coach-step', 'aria-live': 'polite' });
  const dots = STEPS.map(() => h('span', { class: 'cdot' }));
  const pause = h('button', { class: 'btn small', onClick: () => (t.paused ? t.resume() : t.pause()) });
  const word = h('button', { class: 'btn small soft', onClick: () => t.send('word') }, '🐢 Word by word');
  const whole = h('button', { class: 'btn small soft', onClick: () => t.send('whole') }, '🐇 All at once');
  const next = h('button', { class: 'btn small soft', onClick: () => t.send('next') }, '⏭ Next sentence');
  const skip = onSkipAll ? h('button', { class: 'btn small link', onClick: onSkipAll }, 'Skip to questions') : null;
  const paint = (): void => { pause.textContent = t.paused ? '▶ Continue' : '⏸ Pause'; pause.classList.toggle('ok', t.paused); };
  t.onChange(paint);
  paint();
  const el = h('div', { class: 'coach-bar' }, h('div', { class: 'row center' }, label, h('span', { class: 'cdots' }, dots)),
    h('div', { class: 'row center' }, pause, word, whole, next, skip));
  return {
    el,
    step: (n, custom) => {
      const s = STEPS[n - 1];
      label.textContent = custom ?? (s ? `${n}. ${s.icon} ${s.label}` : '');
      dots.forEach((d, i) => d.classList.toggle('on', i < n && !custom));
      word.hidden = whole.hidden = !!custom;
    },
    replays: (visible, pauseVisible = visible) => { word.hidden = whole.hidden = !visible; pause.hidden = !pauseVisible; },
  };
}

export interface CoachResult { check: SentenceCheck; source: Source }

/**
 * Coaches one sentence through the four steps. Returns the grown-up's assessment, or null when
 * the sentence was skipped before the child's turns (nothing to record).
 */
export async function coachSentence(
  kit: Kit, t: Transport, bar: CoachBar, buttons: HTMLElement[], panel: HTMLElement, text: string, sentenceKey: string,
): Promise<CoachResult | null> {
  const wordIdx = buttons.map((b, i) => (/[A-Za-z]/.test(b.textContent ?? '') ? i : -1)).filter((i) => i >= 0);
  const words = wordIdx.map((i) => (buttons[i]?.textContent ?? '').replace(/[^A-Za-z']/g, ''));
  let helped: number[] = [];
  let whole = false;
  let source: Source = 'grownup';
  let assessed = false;
  let step = 1;
  const result = (): CoachResult => ({ check: { text, words, helped: helped.map((i) => wordIdx.indexOf(i)).filter((i) => i >= 0), whole }, source });
  while (step <= 4) {
    bar.step(step);
    bar.replays(step !== 4, step <= 2);
    // Step 4 waits on the record/judge taps, which don't listen to the bar: hide it so no button looks dead.
    bar.el.hidden = step === 4;
    if (step === 1 || step === 2) {
      replace(panel, h('p', { class: 'coach small' }, step === 1 ? '👂 Listen to each word. Follow the yellow hand.' : '👂 Now the whole sentence.'));
      await t.run((stopped) => pointAndRead(kit, buttons, sentenceKey, step === 1 ? 'word' : 'follow', stopped));
    } else if (step === 3) {
      buttons.forEach((b) => b.classList.remove('hit', 'miss'));
      const r = await yourTurnWords(kit, t, buttons, wordIdx, panel);
      if (r !== 'command') { helped = r; assessed = true; }
    } else {
      const model = (): Promise<void> => pointAndRead(kit, buttons, sentenceKey, 'follow');
      const read = await kit.reader.readSentence(panel, text, model, 'Read the whole sentence!');
      bar.el.hidden = false;
      if (read.match) paintHits(buttons, read.match);
      whole = read.pass;
      source = read.source;
    }
    const cmd: Command | null = t.take();
    if (cmd === 'word') step = 1;
    else if (cmd === 'whole') step = 2;
    else if (cmd === 'next') return assessed ? result() : null;
    else step++;
  }
  return result();
}

/**
 * His turn, word by word: the yellow hand waits on each word in silence; the grown-up taps ✓ when he
 * reads it, or 🔊 Help (says the word, marks it). Returns the button indexes he needed help with.
 */
async function yourTurnWords(kit: Kit, t: Transport, buttons: HTMLElement[], wordIdx: number[], panel: HTMLElement): Promise<number[] | 'command'> {
  const helped: number[] = [];
  const mark = (i: number): void => buttons.forEach((b, j) => b.classList.toggle('speaking', j === i));
  for (const i of wordIdx) {
    mark(i);
    buttons[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    let needHelp = false;
    for (;;) {
      const command = t.nextCommand();
      const tap = await new Promise<'ok' | 'help' | 'command'>((resolve) => {
        replace(panel,
          h('p', { class: 'coach small' }, needHelp ? 'Now you say it!' : 'Read the yellow word!'),
          h('div', { class: 'row center' },
            h('button', { class: 'btn big ok', onClick: () => resolve('ok') }, needHelp ? '✓ Said it' : '✓ Read it'),
            h('button', { class: 'btn big soft', onClick: () => resolve('help') }, '🔊 Help')),
          h('p', { class: 'small muted grownup-q' }, 'Grown-up: tap ✓ when he reads the yellow word.'));
        void command.promise.then(() => resolve('command'));
      });
      command.dispose();
      if (tap === 'command') { mark(-1); return 'command'; }
      if (tap === 'ok') break;
      needHelp = true;
      if (!helped.includes(i)) helped.push(i);
      await kit.word((buttons[i]?.textContent ?? '').replace(/[^A-Za-z']/g, ''));
    }
    buttons[i]?.classList.add(needHelp ? 'miss' : 'hit');
  }
  mark(-1);
  return helped;
}
