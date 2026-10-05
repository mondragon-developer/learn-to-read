import { trophies } from '@domain/rewards/Rewards';
import type { AppContext, Screen } from '../context';
import { h, replace } from '../dom';
import { quickGate } from '../parent/gate';

/** The child's home: one huge Kick Off button, streak and stadium progress. */
export class HomeScreen implements Screen {
  constructor(private readonly ctx: AppContext) {}

  async render(host: HTMLElement): Promise<void> {
    const p = this.ctx.player();
    if (!p) { this.ctx.navigate('players'); return; }
    const today = this.ctx.clock.today();
    const events = await this.ctx.log.events(p.id);
    const t = trophies(events, today);
    const playedToday = events.some((e) => e.activity === 'session' && e.day === today);
    const pct = t.next ? Math.round(((t.next.blocks - t.blocksToNext) / t.next.blocks) * 100) : 100;
    replace(host, h('div', { class: 'screen center home' },
      h('h1', {}, `Hi, ${p.firstName}!`),
      h('button', { class: 'kickoff', onClick: () => this.ctx.navigate('session') },
        h('span', { class: 'kickoff-ball', 'aria-hidden': 'true' }, '⚽'),
        h('span', {}, playedToday ? 'Play again' : 'Kick off!')),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', {}, `🔥 ${t.streak}`), h('span', {}, t.streak === 1 ? 'day' : 'days')),
        h('div', { class: 'stat' }, h('b', {}, `⚽ ${t.goals}`), h('span', {}, 'goals')),
        h('div', { class: 'stat' }, h('b', {}, `🧱 ${t.blocks}`), h('span', {}, 'blocks'))),
      h('button', { class: 'practice-btn', onClick: async () => { if (await quickGate(this.ctx.i18n)) this.ctx.navigate('practice'); } },
        h('span', { 'aria-hidden': 'true' }, '🎯'), h('span', {}, 'Practice a skill'), h('span', { class: 'small muted' }, 'Grown-up picks')),
      h('button', { class: 'stadium-card words-card', onClick: () => this.ctx.navigate('words') },
        h('span', {}, '📚 My words'), h('span', { class: 'small' }, 'Hear them, say them, write them')),
      h('button', { class: 'stadium-card', onClick: () => this.ctx.navigate('stadium') },
        h('span', {}, '🏟️ My stadium'),
        t.next ? h('span', { class: 'small' }, `${t.blocksToNext} more blocks for the ${t.next.name.toLowerCase()} ${t.next.emoji}`) : h('span', { class: 'small' }, 'All built! 🏆'),
        h('span', { class: 'meter', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: `width:${pct}%` })))));
  }
}
