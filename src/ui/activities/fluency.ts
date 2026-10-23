import { accuracy, normFor, percentileBand, seasonOf, wcpm, type FluencyRead } from '@domain/reading/Fluency';
import type { Kit } from './kit';
import { h, replace } from '../dom';

const SECONDS = 60;

export interface Passage { id: string; title: string; sentences: string[] }

/**
 * One-minute read (ELA.1.F.1.4). The grown-up starts the clock, taps misread words while he reads,
 * marks the last word reached, and rates expression (NAEP 1-4, as in B.E.S.T. Appendix E).
 * Result: words correct per minute against the grade-1 norm for the season.
 */
export async function fluency(kit: Kit, host: HTMLElement, passage: Passage): Promise<void> {
  await kit.intro(host, 'fluency');
  const t = kit.ctx.i18n;
  const tokens = passage.sentences.join(' ').split(/\s+/);
  const errors = new Set<number>();
  let phase: 'ready' | 'reading' | 'last' = 'ready';
  let last = -1;
  let pickLast: ((i: number) => void) | null = null;
  const words = tokens.map((tok, i) => h('button', { class: 'w', onClick: () => {
    if (phase === 'reading') { errors.has(i) ? errors.delete(i) : errors.add(i); words[i]?.classList.toggle('miss', errors.has(i)); }
    else if (phase === 'last') pickLast?.(i);
  } }, tok));
  const clock = h('div', { class: 'fl-clock', 'aria-live': 'off' }, '1:00');
  const panel = h('div', { class: 'panel' });
  let timer = 0;
  let pausedMs = 0;
  let pausedAt: number | null = null;
  let continueClock: (() => void) | undefined;
  kit.onPlayBreak = () => {
    pausedAt = performance.now(); window.clearTimeout(timer);
    return () => {
      pausedMs += performance.now() - (pausedAt ?? performance.now()); pausedAt = null;
      if (phase === 'reading') continueClock?.();
    };
  };
  replace(host, h('div', { class: 'stage story' }, kit.header('fluency'),
    h('div', { class: 'book' }, h('h2', { class: 'story-title' }, passage.title), h('p', { class: 'line fl-text' }, words)),
    h('div', { class: 'coach-dock' }, clock, panel)));

  // 1. Start
  await new Promise<void>((resolve) => replace(panel, h('button', { class: 'btn big ok', onClick: () => resolve() }, t.t('fl.start'))));
  phase = 'reading';
  const t0 = performance.now();
  pausedMs = 0;
  const elapsed = (): number => Math.min(SECONDS, ((pausedAt ?? performance.now()) - t0 - pausedMs) / 1000);
  kit.abort.signal.addEventListener('abort', () => window.clearTimeout(timer), { once: true });
  await new Promise<void>((resolve) => {
    replace(panel, h('button', { class: 'btn soft', onClick: () => resolve() }, t.t('fl.early')));
    const tick = (): void => {
      const left = Math.max(0, SECONDS - elapsed());
      clock.textContent = `0:${String(Math.ceil(left)).padStart(2, '0')}`;
      if (left <= 0) resolve(); else timer = window.setTimeout(tick, 200);
    };
    continueClock = tick;
    tick();
  });
  window.clearTimeout(timer);
  const seconds = Math.round(elapsed());

  // 2. Last word reached
  phase = 'last';
  last = await new Promise<number>((resolve) => {
    pickLast = resolve;
    replace(panel, h('p', { class: 'coach small grownup-q' }, t.t('fl.tapLast')),
      h('button', { class: 'btn soft', onClick: () => resolve(tokens.length - 1) }, t.t('fl.allRead')));
  });
  words.forEach((w, i) => w.classList.toggle('dim', i > last));

  // 3. Expression (prosody)
  const prosody = await new Promise<number>((resolve) => replace(panel,
    h('p', { class: 'coach small grownup-q' }, t.t('fl.prosody')),
    h('div', { class: 'row center' }, [1, 2, 3, 4].map((n) => h('button', { class: 'btn', onClick: () => resolve(n) }, t.t(`fl.p${n}`))))));

  // 4. Result
  const read: FluencyRead = { words: last + 1, errors: [...errors].filter((i) => i <= last).length, seconds };
  const score = wcpm(read);
  const norm = normFor(seasonOf(new Date(kit.ctx.clock.now())));
  const band = percentileBand(score, norm.table);
  const season = t.t(`season.${norm.season}`);
  replace(panel,
    h('p', { class: 'fl-score' }, t.t('fl.result', { wcpm: score })),
    h('p', { class: 'small muted' }, t.t('fl.detail', { words: read.words, errors: read.errors, acc: Math.round(accuracy(read) * 100), secs: seconds })),
    h('p', {}, t.t('fl.target', { season, target: norm.target })),
    h('p', { class: `rec-badge ${band >= 50 ? 'ok' : 'warn'}` }, band ? t.t('fl.band', { band, season }) : t.t('fl.bandLow', { season })));
  await kit.prompt('great-read');
  await kit.record('fluency', passage.id, score >= norm.target ? 'first-try' : 'after-retry', 'grownup', {
    wcpm: score, words: read.words, errors: read.errors, seconds, prosody, season: norm.season,
  });
  await new Promise<void>((resolve) => panel.appendChild(h('button', { class: 'btn big ok', onClick: () => resolve() }, '⚽ Next')));
}
