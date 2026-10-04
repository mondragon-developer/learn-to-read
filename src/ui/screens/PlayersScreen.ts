import type { AppContext, Screen } from '../context';
import { h, replace } from '../dom';
import { parentGate } from '../parent/gate';

/** "Who's playing?" - jersey cards. Adding a player is a grown-up job (behind the gate). */
export class PlayersScreen implements Screen {
  constructor(private readonly ctx: AppContext) {}

  async render(host: HTMLElement): Promise<void> {
    const players = await this.ctx.profiles.list();
    const setup = h('button', { class: 'btn soft', onClick: async () => { if (await parentGate(this.ctx.i18n)) this.ctx.navigate('parent'); } }, players.length ? '+ Grown-up: add a player' : '🔒 Grown-up: set up a player');
    if (!players.length) {
      replace(host, h('div', { class: 'screen center' },
        h('div', { class: 'hero-ball', 'aria-hidden': 'true' }, '⚽'),
        h('h1', {}, 'Goal Reader'),
        h('p', { class: 'lead' }, 'Five minutes a day. Read words, score goals, build your stadium!'),
        setup));
      return;
    }
    replace(host, h('div', { class: 'screen center' },
      h('h1', {}, 'Who’s playing?'),
      h('div', { class: 'players' }, players.map((p) => h('button', { class: 'player', onClick: () => { this.ctx.setPlayer(p); this.ctx.navigate('home'); } },
        h('span', { class: 'jersey big', style: `background:${p.color}` }, String(p.number)),
        h('span', { class: 'name' }, p.firstName)))),
      setup));
  }
}
