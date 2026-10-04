import type { Card } from '@domain/content/ContentLibrary';
import type { Outcome } from '@domain/storage/events';
import { scoreTrace, type Grid } from '@domain/writing/TraceScorer';
import type { Kit } from './kit';
import { h, replace, shuffle, sleep } from '../dom';

/** Canvas pixels per grid cell when scoring a trace. */
const CELL = 4;
const FONT = (px: number): string => `700 ${px}px Andika, "Comic Sans MS", system-ui, sans-serif`;

/** Write It: trace, write from memory, or build with letter tiles. ELA.1.C.1.1, ELA.1.F.1.3.c */
export async function write(kit: Kit, host: HTMLElement, card: Card, mode: 'trace' | 'free' | 'tiles'): Promise<void> {
  if (mode !== 'tiles') await kit.intro(host, mode);
  if (mode === 'tiles') {
    const outcome = await tiles(kit, host, card); // tiles() shows its own intro
    await kit.record('write', card.id, outcome, 'tiles', { mode });
    return;
  }
  const outcome = mode === 'trace' ? await trace(kit, host, card) : await free(kit, host, card);
  await kit.record('write', card.id, outcome, mode === 'trace' ? 'trace' : 'self', { mode });
}

interface Pad { wrap: HTMLElement; ink: HTMLCanvasElement; guide: HTMLCanvasElement; clear: () => void; size: () => { w: number; h: number; font: number } }

/** Font size for the model word inside a pad of this pixel size. */
const fontFor = (w: number, hh: number): number => Math.round(Math.min(hh * 0.62, w / 3.2));

function pad(): Pad {
  const guide = h('canvas', { class: 'pad-guide', 'aria-hidden': 'true' });
  const ink = h('canvas', { class: 'pad-ink', 'aria-label': 'Writing area' });
  const wrap = h('div', { class: 'pad' }, guide, ink);
  const ctx = ink.getContext('2d') as CanvasRenderingContext2D;
  let drawing = false;
  // Everything (guide, ink, scoring) uses the canvas bitmap size, fixed when the pad opens.
  // Re-measuring the CSS box later (iPad rotated mid-trace) would scale ink against the model.
  const size = (): { w: number; h: number; font: number } => ({ w: ink.width, h: ink.height, font: fontFor(ink.width, ink.height) });
  // Pointer positions are CSS pixels; map them into bitmap pixels in case the box was resized.
  const toBitmap = (e: PointerEvent): [number, number] => {
    const r = ink.getBoundingClientRect();
    return [(e.offsetX * ink.width) / (r.width || 1), (e.offsetY * ink.height) / (r.height || 1)];
  };
  ink.addEventListener('pointerdown', (e) => {
    drawing = true;
    ink.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...toBitmap(e));
  });
  ink.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    for (const p of e.getCoalescedEvents?.() ?? [e]) ctx.lineTo(...toBitmap(p));
    ctx.stroke();
  });
  const end = (): void => { drawing = false; };
  ink.addEventListener('pointerup', end);
  ink.addEventListener('pointercancel', end);
  const clear = (): void => ctx.clearRect(0, 0, ink.width, ink.height);
  // Size canvases to CSS pixels (not devicePixelRatio): scoring works on a coarse grid anyway.
  requestAnimationFrame(() => {
    const r = wrap.getBoundingClientRect();
    for (const c of [guide, ink]) { c.width = Math.round(r.width); c.height = Math.round(r.height); }
    const hh = ink.height;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(8, Math.round(hh / 22));
    ctx.strokeStyle = '#1F5FBF';
  });
  return { wrap, ink, guide, clear, size };
}

function drawGuide(p: Pad, text: string, style: 'dotted' | 'solid'): void {
  const { w, h: hh, font } = p.size();
  const g = p.guide.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, w, hh);
  g.font = FONT(font);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const y = hh * 0.72;
  if (style === 'dotted') {
    g.setLineDash([4, 6]);
    g.lineWidth = 3;
    g.strokeStyle = '#8AA39A';
    g.strokeText(text, w / 2, y);
  } else {
    g.fillStyle = 'rgba(31,122,77,0.35)';
    g.fillText(text, w / 2, y);
  }
}

/** Rasterizes the model word and the child's ink into grids of CELL-px cells. */
function grids(p: Pad, text: string): { model: Grid; child: Grid } {
  const { w, h: hh, font } = p.size();
  const off = document.createElement('canvas');
  off.width = w;
  off.height = hh;
  const o = off.getContext('2d') as CanvasRenderingContext2D;
  o.font = FONT(font);
  o.textAlign = 'center';
  o.fillText(text, w / 2, hh * 0.72);
  const toGrid = (data: Uint8ClampedArray): Grid => {
    const gw = Math.ceil(w / CELL);
    const gh = Math.ceil(hh / CELL);
    const cells = new Array<boolean>(gw * gh).fill(false);
    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < w; x++) {
        if ((data[(y * w + x) * 4 + 3] ?? 0) > 40) cells[Math.floor(y / CELL) * gw + Math.floor(x / CELL)] = true;
      }
    }
    return { width: gw, height: gh, cells };
  };
  const ink = (p.ink.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, w, hh).data;
  return { model: toGrid(o.getImageData(0, 0, w, hh).data), child: toGrid(ink) };
}

async function trace(kit: Kit, host: HTMLElement, card: Card): Promise<Outcome> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = pad();
    const done = h('button', { class: 'btn big ok' }, '✓ Done');
    const msg = h('p', { class: 'coach small' }, 'Trace the word with your finger or pencil.');
    replace(host, h('div', { class: 'stage' }, kit.header('trace'), p.wrap, msg,
      h('div', { class: 'row center' }, h('button', { class: 'btn soft', onClick: p.clear }, '🧽 Clear'), done)));
    await sleep(50);
    drawGuide(p, card.text, 'dotted');
    await kit.prompt('trace-it');
    await new Promise<void>((resolve) => done.addEventListener('click', () => resolve(), { once: true }));
    const { model, child } = grids(p, card.text);
    const score = scoreTrace(model, child, 2);
    if (score.pass) { await kit.prompt('goal'); return attempt === 0 ? 'first-try' : 'after-retry'; }
    msg.textContent = 'Nice try! Let’s trace it once more.';
    await kit.prompt('try-again');
  }
  return 'missed';
}

async function free(kit: Kit, host: HTMLElement, card: Card): Promise<Outcome> {
  const p = pad();
  const done = h('button', { class: 'btn big ok' }, '✓ Done');
  const peek = h('div', { class: 'word small' }, card.text);
  replace(host, h('div', { class: 'stage' }, kit.header('free'), peek, p.wrap,
    h('div', { class: 'row center' }, h('button', { class: 'btn soft', onClick: p.clear }, '🧽 Clear'), done)));
  await kit.word(card.text);
  await sleep(1800);
  peek.classList.add('hidden-word');
  await kit.prompt('write-it');
  await new Promise<void>((resolve) => done.addEventListener('click', () => resolve(), { once: true }));
  await sleep(50);
  drawGuide(p, card.text, 'solid');
  peek.classList.remove('hidden-word');
  const answer = await new Promise<boolean>((resolve) => {
    done.replaceWith(h('div', { class: 'row center' },
      h('button', { class: 'btn big ok', onClick: () => resolve(true) }, '👍 Looks the same'),
      h('button', { class: 'btn big soft', onClick: () => resolve(false) }, '👎 Not yet')));
  });
  if (answer) await kit.prompt('goal');
  return answer ? 'first-try' : 'missed';
}

const DISTRACTORS = 'abcdefghijklmnoprstuvwxyz';

/** Letter tiles: hear the word, build it. Tap is easier than drag on a phone. */
export async function tiles(kit: Kit, host: HTMLElement, card: Card): Promise<Outcome> {
  await kit.intro(host, 'tiles');
  const parts = card.graphemes ?? [...card.text.toLowerCase()];
  const extra = shuffle([...DISTRACTORS].filter((c) => !parts.includes(c)), Math.random()).slice(0, 2);
  for (let attempt = 0; attempt < 2; attempt++) {
    const built: string[] = [];
    const slots = parts.map(() => h('span', { class: 'slot' }));
    const bank = shuffle([...parts, ...extra]).map((g) => {
      const b = h('button', { class: 'tile', onClick: () => {
        if (built.length >= parts.length || b.disabled) return;
        built.push(g);
        b.disabled = true;
        const slot = slots[built.length - 1];
        if (slot) slot.textContent = g;
        void kit.ctx.audio.play(`sound:${g}`);
      } }, g);
      return b;
    });
    const undo = h('button', { class: 'btn soft', onClick: () => {
      const g = built.pop();
      if (g === undefined) return;
      const slot = slots[built.length];
      if (slot) slot.textContent = '';
      bank.find((b) => b.disabled && b.textContent === g)?.removeAttribute('disabled');
    } }, '⌫ Undo');
    const check = h('button', { class: 'btn big ok' }, '✓ Check');
    replace(host, h('div', { class: 'stage' }, kit.header('tiles'),
      h('button', { class: 'btn link', onClick: () => void kit.word(card.text) }, '🔊 Hear the word'),
      h('div', { class: 'slots' }, slots), h('div', { class: 'tiles bank' }, bank), h('div', { class: 'row center' }, undo, check)));
    await kit.prompt('spell-it');
    await kit.word(card.text);
    await new Promise<void>((resolve) => check.addEventListener('click', () => resolve(), { once: true }));
    if (built.join('') === parts.join('')) { await kit.prompt('goal'); return attempt === 0 ? 'first-try' : 'after-retry'; }
    await kit.prompt('try-again');
  }
  replace(host, h('div', { class: 'stage' }, h('div', { class: 'word' }, card.text)));
  await kit.word(card.text);
  return 'missed';
}
