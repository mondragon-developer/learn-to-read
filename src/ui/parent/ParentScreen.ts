import type { Profile } from '@domain/profiles/Profile';
import type { AppContext, NavParams, Screen } from '../context';
import { h, replace } from '../dom';
import { summary } from './summary';
import { settingsSection } from './settingsSection';
import { playersSection } from './playersSection';
import { accountSection } from './accountSection';
import { helpSection } from './helpSection';

type Tab = 'summary' | 'settings' | 'players' | 'account' | 'help';
const TABS: readonly Tab[] = ['summary', 'settings', 'players', 'account', 'help'];

/** Área de padres (Spanish by default): tabs and routing only; each tab is its own module. */
export class ParentScreen implements Screen {
  private tab: Tab = 'summary';
  private selected: string | null = null;

  constructor(private readonly ctx: AppContext) {}

  /** Coming back through the gate always opens on the summary. */
  dispose(): void { this.tab = 'summary'; this.ctx.audio.stop(); this.ctx.audio.selectVoice?.(this.ctx.player()?.settings.voice ?? 'teacher'); }

  async render(host: HTMLElement, params?: NavParams): Promise<void> {
    if (params?.settings) { this.tab = 'settings'; this.selected = this.ctx.player()?.id ?? null; }
    const { i18n: t } = this.ctx;
    const players = await this.ctx.profiles.list();
    if (!players.length) this.tab = 'players';
    const p = players.find((x) => x.id === this.selected) ?? this.ctx.player() ?? players[0] ?? null;
    this.selected = p?.id ?? null;
    const refresh = (): void => { void this.render(host); };

    const tabs = h('nav', { class: 'ptabs', role: 'tablist' }, TABS.map((id) => h('button', {
      role: 'tab', 'aria-selected': String(id === this.tab), class: id === this.tab ? 'on' : '',
      onClick: () => { this.tab = id; refresh(); },
    }, t.t(`tab.${id}`))));
    const picker = players.length > 1
      ? h('div', { class: 'row' }, players.map((x) => h('button', { class: `btn small ${x.id === this.selected ? 'ok' : 'soft'}`, onClick: () => { this.selected = x.id; refresh(); } }, x.firstName)))
      : null;
    const body = h('div', {});
    replace(host, h('div', { class: 'screen parent', lang: t.locale },
      h('div', { class: 'row between' },
        h('h1', {}, t.t('parent.title')),
        h('div', { class: 'row' },
          h('button', { class: 'btn small soft', onClick: () => { t.set(t.locale === 'es' ? 'en' : 'es'); refresh(); } }, t.t('parent.lang')),
          h('button', { class: 'btn small', onClick: () => this.ctx.navigate(this.ctx.player() ? 'home' : 'players') }, t.t('parent.back')))),
      tabs, picker, body));
    replace(body, await this.section(p, players, refresh));
  }

  private async section(p: Profile | null, players: Profile[], refresh: () => void): Promise<HTMLElement> {
    if (this.tab === 'players' || !p) {
      return playersSection(this.ctx, players, (created) => { this.selected = created.id; this.tab = 'settings'; refresh(); });
    }
    switch (this.tab) {
      case 'summary': return summary(this.ctx, p);
      case 'settings': return settingsSection(this.ctx, p, refresh);
      case 'account': return accountSection(this.ctx, refresh);
      case 'help': return helpSection(this.ctx);
    }
  }
}
