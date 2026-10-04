import type { Card } from '@domain/content/ContentLibrary';
import { clipKey } from '@domain/audio/AudioCatalog';
import { rebuildDeck, isMastered, type DeckState } from '@domain/srs/Leitner';
import type { AppContext, Screen } from '../context';
import { h, replace, sleep } from '../dom';
import { Kit } from '../activities/kit';
import { soundTiles, syllableTiles, wordView } from '../activities/wordView';
import { tiles, write } from '../activities/write';
import { playTake, recordTake } from '../activities/takeUi';

type Filter = { kind: 'mine' } | { kind: 'challenge' } | { kind: 'unit'; unit: number };

/**
 * "My words": every word he can practice. Tap one to hear it, hear it slowly, record himself and
 * compare, trace it or build it. Practice here never moves review boxes (only sessions do).
 */
export class WordBankScreen implements Screen {
  private filter: Filter = { kind: 'mine' };
  private kit: Kit | null = null;

  constructor(private readonly ctx: AppContext) {}

  dispose(): void {
    if (this.kit) this.kit.closed = true;
    this.ctx.audio.stop();
  }

  async render(host: HTMLElement): Promise<void> {
    const p = this.ctx.player();
    if (!p) { this.ctx.navigate('players'); return; }
    const deck = rebuildDeck(await this.ctx.log.events(p.id));
    this.kit = new Kit(this.ctx, p, `bank-${this.ctx.clock.today()}`, () => undefined);
    this.kit.known = new Set(deck.keys());
    this.paintList(host, deck);
  }

  private cards(deck: DeckState): Card[] {
    const lib = this.ctx.library;
    if (this.filter.kind === 'challenge') return lib.challengeOrder.map((id) => lib.card(id)).filter((c): c is Card => !!c);
    if (this.filter.kind === 'unit') return lib.unitCards(this.filter.unit);
    return [...deck.keys()].map((id) => lib.card(id) ?? lib.storyCard(id.slice(2))).sort((a, b) => a.text.localeCompare(b.text));
  }

  private paintList(host: HTMLElement, deck: DeckState): void {
    const lib = this.ctx.library;
    const seg = (label: string, f: Filter): HTMLElement => h('button', {
      class: `seg ${JSON.stringify(f) === JSON.stringify(this.filter) ? 'on' : ''}`,
      onClick: () => { this.filter = f; this.paintList(host, deck); },
    }, label);
    const unitPick = h('select', { 'aria-label': 'Unit', onChange: (e: Event) => { this.filter = { kind: 'unit', unit: Number((e.target as HTMLSelectElement).value) }; this.paintList(host, deck); } },
      h('option', { value: '' }, 'Units…'),
      lib.units.map((u) => h('option', { value: String(u.order), selected: this.filter.kind === 'unit' && this.filter.unit === u.order }, `${u.order}. ${u.title}`)));
    const cards = this.cards(deck);
    const stars = (c: Card): string => {
      const s = deck.get(c.id);
      if (!s) return '';
      return isMastered(s) ? ' 🏅' : ' ' + '•'.repeat(Math.min(5, s.box));
    };
    replace(host, h('div', { class: 'screen wordbank' },
      h('div', { class: 'row between' }, h('h1', {}, '📚 My words'), h('button', { class: 'btn small', onClick: () => this.ctx.navigate('home') }, '⚽ Home')),
      h('div', { class: 'segs' }, seg('My words', { kind: 'mine' }), seg('🏆 Challenge', { kind: 'challenge' }), unitPick),
      cards.length
        ? h('div', { class: 'word-grid' }, cards.map((c) => h('button', { class: `word-btn ${c.kind}`, onClick: () => void this.paintWord(host, deck, c) }, c.text, h('span', { class: 'box-dots', 'aria-hidden': 'true' }, stars(c)))))
        : h('p', { class: 'lead' }, 'Play a match to collect your first words!')));
  }

  private async paintWord(host: HTMLElement, deck: DeckState, card: Card): Promise<void> {
    const kit = this.kit;
    if (!kit) return;
    await this.ctx.audio.unlock();
    const audio = this.ctx.audio;
    const parts = card.kind === 'challenge' ? syllableTiles(card, audio) : card.kind === 'decodable' ? soundTiles(card, audio) : null;
    const panel = h('div', { class: 'panel' });
    const es = h('p', { class: 'es-gloss', hidden: true, lang: 'es' }, card.es ? `🇪🇸 ${card.es}` : '🇪🇸 —');
    const back = (): void => this.paintList(host, deck);
    replace(host, h('div', { class: 'screen' }, h('div', { class: 'stage' },
      h('div', { class: 'stage-head' }, h('button', { class: 'btn small soft', onClick: back }, '← All words')),
      wordView(card), parts?.el,
      h('div', { class: 'row center actions' },
        h('button', { class: 'btn big', onClick: () => void kit.word(card.text) }, '🔊 Hear it'),
        parts ? h('button', { class: 'btn big', onClick: () => void parts.play() }, card.kind === 'challenge' ? '🐢 Slowly' : '🧩 Sounds') : null,
        this.ctx.recorder.available ? h('button', { class: 'btn big', onClick: () => void this.compare(panel, card) }, '🎙 Say it & hear me') : null),
      h('div', { class: 'row center actions' },
        h('button', { class: 'btn', onClick: async () => { await write(kit, host, card, 'trace'); await this.paintWord(host, deck, card); } }, '✏️ Trace it'),
        h('button', { class: 'btn', onClick: async () => { await tiles(kit, host, card); await this.paintWord(host, deck, card); } }, '🧱 Build it'),
        h('button', { class: 'btn soft', onClick: () => { es.hidden = !es.hidden; } }, '🇪🇸 Para mamá')),
      es, panel)));
    await kit.word(card.text);
  }

  /** Record him, play his take, then the model - so he can hear the difference himself. */
  private async compare(panel: HTMLElement, card: Card): Promise<void> {
    const t = this.ctx.i18n;
    const r = await recordTake(this.ctx.recorder, t, panel, `Say “${card.text}”`, 4000);
    if ('error' in r) { replace(panel, h('p', { class: 'rec-badge warn', role: 'alert' }, `⚠️ ${r.message}`)); return; }
    const note = h('div', { class: 'rec-note' });
    const hearBoth = async (): Promise<void> => {
      replace(panel, h('p', { class: 'coach' }, '👂 You said…'), note);
      const ok = (await playTake(this.ctx.recorder, t, r.take, (b) => replace(note, b))).ok;
      replace(panel, h('p', { class: 'coach' }, '🔊 It sounds like…'), note);
      await sleep(200);
      await this.ctx.audio.play(clipKey.word(card.text));
      replace(panel, ok ? h('button', { class: 'btn soft', onClick: () => void hearBoth() }, '▶ Hear both again') : null, note);
    };
    await hearBoth();
  }
}
