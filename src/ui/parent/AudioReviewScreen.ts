import type { Clip, ClipKind } from '@domain/audio/AudioCatalog';
import type { AppContext, Screen } from '../context';
import { h, replace } from '../dom';

const BAD_KEY = 'goal-reader.badClips';
const KINDS: readonly ClipKind[] = ['sound', 'word', 'slow', 'sentence', 'story', 'prompt'];

/**
 * Listen to every generated clip and mark the bad ones (isolated sounds especially).
 * Marked keys are kept on this device and shown as the --redo list for the generator.
 */
export class AudioReviewScreen implements Screen {
  private kind: ClipKind = 'sound';
  constructor(private readonly ctx: AppContext, private readonly catalog: Clip[]) {}

  render(host: HTMLElement): void {
    const { i18n: t, audio } = this.ctx;
    const bad = loadBad();
    const redo = h('code', { class: 'redo' }, [...bad].join(','));
    const rows = this.catalog.filter((c) => c.kind === this.kind).map((c) => {
      const mark = h('input', { type: 'checkbox', checked: bad.has(c.key), onChange: (e: Event) => {
        if ((e.target as HTMLInputElement).checked) bad.add(c.key); else bad.delete(c.key);
        saveBad(bad);
        redo.textContent = [...bad].join(',');
      } });
      return h('li', { class: 'clip-row' },
        h('button', { class: 'speaker', 'aria-label': `Play ${c.key}`, onClick: async () => { await audio.unlock(); await audio.play(c.key); } }, '🔊'),
        h('span', { class: 'clip-text' }, c.text),
        c.ttsText !== c.text ? h('span', { class: 'muted small' }, `“${c.ttsText}”`) : null,
        audio.has(c.key) ? null : h('span', { class: 'muted small' }, t.t('audio.missing')),
        h('label', { class: 'small' }, mark, ` ${t.t('audio.bad')}`));
    });
    replace(host, h('div', { class: 'screen parent' },
      h('div', { class: 'row between' }, h('h1', {}, t.t('audio.title')), h('button', { class: 'btn small', onClick: () => this.ctx.navigate('parent') }, t.t('parent.back'))),
      h('p', { class: 'muted' }, t.t('audio.help')),
      h('nav', { class: 'ptabs' }, KINDS.map((k) => h('button', { class: k === this.kind ? 'on' : '', onClick: () => { this.kind = k; this.render(host); } }, k))),
      h('p', {}, `${t.t('audio.badList')}: `, redo),
      h('ul', { class: 'clips' }, rows)));
  }
}

function loadBad(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BAD_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
function saveBad(s: Set<string>): void {
  try { localStorage.setItem(BAD_KEY, JSON.stringify([...s])); } catch { /* private mode */ }
}
