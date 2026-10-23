import type { AppContext, NavParams, Screen, ScreenId } from './context';
import { h, replace } from './dom';
import { parentGate } from './parent/gate';
import { Kit } from './activities/kit';
import { newEventId } from '@domain/storage/events';

/** App frame: a slim header (player chip + grown-ups lock) and the screen host. Routes only. */
export class AppShell {
  private main = h('main', { id: 'main' });
  private chip = h('button', { class: 'player-chip', 'aria-label': 'Change player' });
  private current: Screen | null = null;
  private currentId: ScreenId = 'players';
  private play = h('button', { class: 'soccer-launcher', 'aria-label': 'Play soccer anytime', onClick: () => void this.playSoccer() }, '⚽ Play');
  private closeGame: (() => void) | null = null;

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
      this.main, this.play));
    this.paintChip();
  }

  navigate = async (id: ScreenId, params?: NavParams): Promise<void> => {
    this.closeGame?.();
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
    this.play.hidden = !p || ['players', 'parent', 'audio-review'].includes(this.currentId);
    this.chip.hidden = !p;
    if (p) replace(this.chip, h('span', { class: 'jersey', style: `background:${p.color}` }, String(p.number)), h('span', {}, p.firstName));
  }

  async playSoccer(): Promise<void> {
    const profile = this.ctx.player();
    if (!profile || this.closeGame) return;
    const existing = this.main.querySelector<HTMLElement>('.soccer-stage, .soccer-kit');
    if (existing) { existing.scrollIntoView({ block: 'center' }); existing.querySelector<HTMLElement>('button')?.focus(); return; }
    const resume = this.current?.pause?.() ?? (() => undefined);
    this.ctx.audio.stop(); this.ctx.checker.cancel(); this.ctx.recorder.stop?.();
    const kit = new Kit({ ...this.ctx, navigate: this.navigate }, profile, newEventId(), () => undefined);
    const stage = h('div');
    const dialog = h('dialog', { class: 'soccer-dialog', 'aria-label': 'Soccer play break' },
      h('button', { class: 'btn soft soccer-dialog-close', onClick: () => finish() }, '← Back to where I was'), stage);
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    let closed = false;
    const finish = (): void => {
      if (closed) return;
      closed = true; kit.cancel(); dialog.close(); dialog.remove();
      document.body.style.overflow = overflow;
      this.closeGame = null; this.main.inert = false; resume();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
    this.closeGame = finish;
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(); });
    document.body.appendChild(dialog);
    this.main.inert = true; document.body.style.overflow = 'hidden'; dialog.showModal();
    try {
      // Let the suspended leaf finish cleanup before this game's audio begins.
      await this.ctx.audio.unlock();
      const { soccerBreak } = await import('./activities/soccer');
      if (!closed) await soccerBreak(kit, stage, { anytime: true });
    } finally { finish(); }
  }
}
