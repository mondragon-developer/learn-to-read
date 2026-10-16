import type { AppContext, NavParams, Screen, ScreenId } from './context';
import { h, replace } from './dom';
import { parentGate } from './parent/gate';

/** App frame: a slim header (player chip + grown-ups lock) and the screen host. Routes only. */
export class AppShell {
  private main = h('main', { id: 'main' });
  private chip = h('button', { class: 'player-chip', 'aria-label': 'Change player' });
  private current: Screen | null = null;
  private currentId: ScreenId = 'players';

  constructor(private readonly ctx: Omit<AppContext, 'navigate'>, private readonly screens: Record<ScreenId, Screen>) {}

  mount(root: HTMLElement): void {
    const lock = h('button', { class: 'btn small lock', 'aria-label': 'Settings / Ajustes', onClick: async () => {
      if (await parentGate(this.ctx.i18n)) void this.navigate('parent', { settings: true });
    } }, '⚙️ Settings');
    this.chip.addEventListener('click', () => void this.navigate('players'));
    replace(root, h('div', { class: 'app' },
      h('header', { class: 'top' },
        h('button', { class: 'brand', 'aria-label': 'Goal Reader', onClick: () => void this.navigate(this.ctx.player() ? 'home' : 'players') }, h('span', { 'aria-hidden': 'true' }, '⚽'), h('span', {}, 'Goal Reader')),
        h('div', { class: 'spacer' }), this.chip, lock),
      this.main));
    this.paintChip();
  }

  navigate = async (id: ScreenId, params?: NavParams): Promise<void> => {
    this.current?.dispose?.();
    this.currentId = id;
    this.current = this.screens[id];
    document.body.dataset.screen = id;
    this.paintChip();
    window.scrollTo({ top: 0 });
    await this.current.render(this.main, params);
  };

  get screenId(): ScreenId { return this.currentId; }

  paintChip(): void {
    const p = this.ctx.player();
    this.chip.hidden = !p;
    if (p) replace(this.chip, h('span', { class: 'jersey', style: `background:${p.color}` }, String(p.number)), h('span', {}, p.firstName));
  }
}
