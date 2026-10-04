import { STADIUM_PARTS, trophies } from '@domain/rewards/Rewards';
import type { AppContext, Screen } from '../context';
import { h, replace } from '../dom';

/** The stadium he builds with blocks earned from goals. Locked parts show what is coming. */
export class StadiumScreen implements Screen {
  constructor(private readonly ctx: AppContext) {}

  async render(host: HTMLElement): Promise<void> {
    const p = this.ctx.player();
    if (!p) { this.ctx.navigate('players'); return; }
    const t = trophies(await this.ctx.log.events(p.id), this.ctx.clock.today());
    const built = new Set(t.built.map((b) => b.id));
    replace(host, h('div', { class: 'screen center' },
      h('h1', {}, `${p.firstName}’s stadium`),
      h('p', { class: 'lead' }, `🧱 ${t.blocks} blocks · every 3 goals = 1 block`),
      h('div', { class: 'stadium' }, STADIUM_PARTS.map((part) => h('div', { class: `part ${built.has(part.id) ? 'built' : 'locked'}` },
        h('span', { class: 'part-emoji', 'aria-hidden': 'true' }, built.has(part.id) ? part.emoji : '🔒'),
        h('span', { class: 'part-name' }, part.name),
        built.has(part.id) ? null : h('span', { class: 'small' }, `${part.blocks} 🧱`)))),
      h('button', { class: 'btn big ok', onClick: () => this.ctx.navigate('home') }, '⚽ Back to the field')));
  }
}
