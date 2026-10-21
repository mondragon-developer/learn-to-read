import type { AppContext, Screen } from '../context';
import { h, replace } from '../dom';

/** A child can choose a short story without going through the daily word drills. */
export class StoriesScreen implements Screen {
  constructor(private readonly ctx: AppContext) {}
  async render(host: HTMLElement): Promise<void> {
    const p = this.ctx.player();
    if (!p) { this.ctx.navigate('players'); return; }
    const events = await this.ctx.log.events(p.id);
    const completed = new Set(events.filter((e) => e.activity === 'story-order').map((e) => e.itemId.split(':')[0]));
    const cards = (soccer: boolean): HTMLElement[] => this.ctx.library.stories
      .filter((s) => (s.collection === 'soccer') === soccer)
      .sort((a, b) => a.sentences.length - b.sentences.length || a.unit - b.unit)
      .map((s) => h('button', { class: 'story-card btn soft', onClick: async () => {
        await this.ctx.audio.unlock();
        this.ctx.navigate('session', { storyId: s.id, ready: true });
      } }, h('b', {}, s.title), h('span', { class: 'small' }, `${s.sentences.length} sentences · ${s.tier === 'readalong' ? 'Read with help' : 'Sound it out'}${completed.has(s.id) ? ' · Read again' : ''}`)));
    replace(host, h('div', { class: 'screen stories-library' },
      h('div', { class: 'row between' }, h('h1', {}, 'Choose a short story'), h('button', { class: 'btn soft', onClick: () => this.ctx.navigate('home') }, 'Back home')),
      h('p', {}, 'Start with six sentences. Try a longer story when you feel ready.'),
      h('section', {}, h('h2', {}, 'Soccer stories'), h('p', { class: 'small muted' }, 'Real players and real matches. Tap below a name or word to hear it.'), h('div', { class: 'story-grid' }, cards(true))),
      h('section', {}, h('h2', {}, 'More short stories'), h('div', { class: 'story-grid' }, cards(false)))));
  }
}
