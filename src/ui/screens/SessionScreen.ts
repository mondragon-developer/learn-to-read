import { rebuildDeck } from '@domain/srs/Leitner';
import { newEventId } from '@domain/storage/events';
import { GOALS_PER_BLOCK, trophies } from '@domain/rewards/Rewards';
import { clipKey } from '@domain/audio/AudioCatalog';
import type { Step } from '@domain/session/SessionPlanner';
import type { AppContext, NavParams, Screen } from '../context';
import { h, replace, sleep } from '../dom';
import { Kit } from '../activities/kit';
import { runStep } from '../activities/runners';

const LEAVE_HOLD_MS = 800;

/** One match: runs the planned steps, keeps score, ends with Full Time (and optional Extra Time). */
export class SessionScreen implements Screen {
  private kit: Kit | null = null;

  constructor(private readonly ctx: AppContext) {}

  async render(host: HTMLElement, params?: NavParams): Promise<void> {
    const profile = this.ctx.player();
    if (!profile) { this.ctx.navigate('players'); return; }
    const { library, planner, clock } = this.ctx;
    const events = await this.ctx.log.events(profile.id);
    const deck = rebuildDeck(events);
    const input = { library, deck, events, today: clock.today(), settings: profile.settings };
    const plan = params?.extra ? planner.planExtra(input) : planner.plan(input);

    const score = h('b', {}, '0');
    const fill = h('div', { class: 'pitch-fill' });
    const ball = h('span', { class: 'pitch-ball', 'aria-hidden': 'true' }, '⚽');
    const stage = h('div', { class: 'stage-host' });
    const leave = h('button', { class: 'iconbtn', 'aria-label': 'Hold to leave' }, '🏠');
    let leaveTimer: number | undefined;
    leave.addEventListener('pointerdown', () => { leaveTimer = window.setTimeout(() => this.ctx.navigate('home'), LEAVE_HOLD_MS); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) leave.addEventListener(ev, () => window.clearTimeout(leaveTimer));
    const flash = h('div', { class: 'goal-flash', 'aria-live': 'polite' });
    replace(host, h('div', { class: 'session' },
      h('div', { class: 'session-top' }, leave, h('div', { class: 'pitch-bar', role: 'progressbar', 'aria-label': 'Match progress' }, fill, ball), h('div', { class: 'scoreboard' }, '⚽ ', score)),
      stage, flash));

    const progress = (x: number): void => {
      const pct = `${Math.round(x * 100)}%`;
      fill.style.width = pct;
      ball.style.left = `calc(${pct} - 14px)`;
    };
    const kit = new Kit(this.ctx, profile, newEventId(), (g) => {
      score.textContent = String(g);
      flash.textContent = 'GOAL!';
      flash.classList.remove('show');
      void flash.offsetWidth;
      flash.classList.add('show');
    });
    kit.known = new Set(deck.keys());
    this.kit = kit;

    if (!params?.extra) await this.kickoff(stage, plan.steps);
    else await this.ctx.audio.play(clipKey.prompt('extra-time'));
    if (kit.closed) return;

    const t0 = clock.now();
    const groups = plan.steps.map((st) => this.group(st));
    for (let i = 0; i < plan.steps.length; i++) {
      if (kit.closed) return;
      progress(i / plan.steps.length);
      const step = plan.steps[i] as Step;
      const g = groups[i];
      kit.step = { n: groups.slice(0, i + 1).filter((x) => x === g).length, of: groups.filter((x) => x === g).length };
      try { await runStep(kit, stage, step); }
      catch (err) { console.error('step failed', step, err); }
    }
    if (kit.closed) return;
    progress(1);
    await kit.record('session', kit.sessionId, 'first-try', 'tap', {
      plannedMin: profile.settings.minutes, durationMs: clock.now() - t0, goals: kit.goals, steps: plan.steps.length, extra: !!params?.extra,
      micFallback: kit.grownUpMode,
    });
    void this.ctx.sync.sync();
    await this.fullTime(stage, kit.goals);
  }

  dispose(): void {
    if (this.kit) this.kit.closed = true;
    this.kit = null;
    this.ctx.audio.stop();
    this.ctx.checker.cancel(); // the recognizer is shared; stop any listen in flight
  }

  /** Counter groups: challenge words count apart from the unit's new words. */
  private group(step: Step): string {
    if (step.kind === 'new-word' && this.ctx.library.card(step.cardId)?.kind === 'challenge') return 'challenge';
    return step.kind;
  }

  /**
   * "Today's match": what is coming and the grown-up's job, then Kick off. The tap also unlocks
   * audio on iOS, so the session must start with a button.
   */
  private async kickoff(stage: HTMLElement, steps: Step[]): Promise<void> {
    const count = (g: string): number => steps.filter((st) => this.group(st) === g).length;
    const parts: [string, string][] = [
      ['🎵', count('warmup') ? 'A sound game' : ''],
      ['🔁', count('review') ? `${count('review')} words to review` : ''],
      ['⭐', count('new-word') ? `${count('new-word')} new words` : ''],
      ['🏆', count('challenge') ? '1 challenge word' : ''],
      ['✏️', count('write') ? 'Write a word' : ''],
      ['📖', count('sentence') ? 'Read a sentence' : ''],
      ['📘', count('story') ? 'A story with 3 questions' : ''],
      ['🎮', count('game') ? `${count('game')} games` : ''],
    ];
    const t = this.ctx.i18n;
    await new Promise<void>((resolve) => replace(stage, h('div', { class: 'stage center' },
      h('h2', {}, 'Today’s match'),
      h('ol', { class: 'plan-list' }, parts.filter(([, text]) => text).map(([icon, text]) => h('li', {}, h('span', { 'aria-hidden': 'true' }, icon), ` ${text}`))),
      h('button', { class: 'kickoff compact', onClick: async () => { await this.ctx.audio.unlock(); resolve(); } },
        h('span', { class: 'kickoff-ball', 'aria-hidden': 'true' }, '⚽'), h('span', {}, 'Kick off!')),
      h('div', { class: 'grownup-note', lang: t.locale }, h('b', {}, `👪 ${t.t('howto.grownup')}: `), t.t('plan.grownup')))));
    await this.ctx.audio.play(clipKey.prompt('start'));
  }

  private async fullTime(stage: HTMLElement, goals: number): Promise<void> {
    const p = this.ctx.player();
    if (!p) return;
    const t = trophies(await this.ctx.log.events(p.id), this.ctx.clock.today());
    const blocksNow = Math.floor(goals / GOALS_PER_BLOCK);
    replace(stage, h('div', { class: 'stage center fulltime' },
      h('div', { class: 'whistle', 'aria-hidden': 'true' }, '🏆'),
      h('h1', {}, 'Full time!'),
      h('p', { class: 'lead' }, `You scored ${goals} goal${goals === 1 ? '' : 's'}!`),
      blocksNow ? h('p', { class: 'lead' }, `+${blocksNow} 🧱 for your stadium`) : null,
      t.next ? h('p', { class: 'small' }, `${t.blocksToNext} more blocks for the ${t.next.name.toLowerCase()} ${t.next.emoji}`) : null,
      h('div', { class: 'row center' },
        h('button', { class: 'btn big', onClick: () => this.ctx.navigate('session', { extra: true }) }, '⏱ Extra time'),
        h('button', { class: 'btn big ok', onClick: () => this.ctx.navigate('stadium') }, '🏟️ My stadium')),
      h('button', { class: 'btn link', onClick: () => this.ctx.navigate('home') }, 'Done for today')));
    await this.ctx.audio.play(clipKey.prompt('full-time'));
    await sleep(200);
  }
}
