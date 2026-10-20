import { rebuildDeck } from '@domain/srs/Leitner';
import { newEventId } from '@domain/storage/events';
import { GOALS_PER_BLOCK, trophies } from '@domain/rewards/Rewards';
import { clipKey } from '@domain/audio/AudioCatalog';
import type { Step } from '@domain/session/SessionPlanner';
import { decodeChoice } from '@domain/practice/Topics';
import type { AppContext, NavParams, Screen } from '../context';
import { h, replace, sleep } from '../dom';
import { Kit } from '../activities/kit';
import { runStep } from '../activities/runners';
import { soccerBreak } from '../activities/soccer';
import { SoccerBreaks } from '@domain/rewards/Soccer';
import { chooseSoccerKit } from '../activities/soccerPlayer';

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
    const choice = params?.topic ? decodeChoice(params.topic) : null;
    const plan = choice ? planner.planTopic(input, choice) : params?.extra ? planner.planExtra(input) : planner.plan(input);

    let skipGroup = false;
    const score = h('b', {}, '0');
    const fill = h('div', { class: 'pitch-fill' });
    const ball = h('span', { class: 'pitch-ball', 'aria-hidden': 'true' }, '⚽');
    const stage = h('div', { class: 'stage-host' });
    const breaks = new SoccerBreaks(plan.steps.length, profile.settings.minutes, profile.settings.soccerBreaks !== false && !params?.extra);
    const breakProgress = h('div', { class: 'soccer-progress', 'aria-live': 'polite' });
    const paintBreakProgress = (): void => {
      breakProgress.hidden = !breaks.available;
      replace(breakProgress,
        h('span', { 'aria-hidden': 'true' }, [0, 1, 2].map((n) => h('i', { class: n < Math.floor((1 - breaks.remaining / breaks.interval) * 3) ? 'filled' : '' })), ' ⚽'),
        h('span', {}, `${breaks.remaining} ${breaks.remaining === 1 ? 'activity' : 'activities'} until soccer`));
    };
    paintBreakProgress();
    const leave = h('button', { class: 'iconbtn', 'aria-label': 'Hold to leave' }, '🏠');
    let leaveTimer: number | undefined;
    leave.addEventListener('pointerdown', () => { leaveTimer = window.setTimeout(() => this.ctx.navigate('home'), LEAVE_HOLD_MS); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) leave.addEventListener(ev, () => window.clearTimeout(leaveTimer));
    const flash = h('div', { class: 'goal-flash', 'aria-live': 'polite' });
    replace(host, h('div', { class: 'session' },
      h('div', { class: 'session-top' }, leave, h('div', { class: 'pitch-bar', role: 'progressbar', 'aria-label': 'Match progress' }, fill, ball), h('div', { class: 'scoreboard' }, '⚽ ', score)),
      h('nav', { class: 'session-skip', 'aria-label': 'Practice controls' },
        h('button', { class: 'btn soft skip-part', onClick: () => this.kit?.skipPart() }, 'Skip this part →'),
        h('button', { class: 'btn soft skip-section', onClick: () => { skipGroup = true; this.kit?.skipSection(); } }, 'Skip section ⇥')),
      breakProgress, stage, flash));

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

    if (!params?.extra && !(kit.independent && params?.ready)) await kit.part(stage, async (part, target) => this.kickoff(part, target, plan.steps));
    else if (params?.extra) await this.ctx.audio.play(clipKey.prompt('extra-time'));
    if (kit.closed) return;

    skipGroup = false;
    const t0 = clock.now();
    let soccerMs = 0;
    const playSoccer = async (chooseKit = false): Promise<void> => {
      const started = clock.now();
      const controls = host.querySelector<HTMLElement>('.session-skip');
      if (controls) controls.hidden = true;
      breakProgress.hidden = true;
      try {
        if (chooseKit) await kit.part(stage, chooseSoccerKit);
        if (!kit.closed) await kit.part(stage, soccerBreak);
      } catch (err) { if (!kit.closed) console.error('soccer break failed', err); }
      finally {
        soccerMs += Math.max(0, clock.now() - started);
        if (controls) controls.hidden = false;
      }
    };
    if (profile.settings.soccerBreaks !== false && !params?.extra) {
      await playSoccer(true);
      if (kit.closed) return;
      paintBreakProgress();
    }
    const groups = plan.steps.map((st) => this.group(st));
    for (let i = 0; i < plan.steps.length; i++) {
      if (kit.closed) return;
      progress(i / plan.steps.length);
      const step = plan.steps[i] as Step;
      const g = groups[i];
      kit.step = { n: groups.slice(0, i + 1).filter((x) => x === g).length, of: groups.filter((x) => x === g).length };
      const before = kit.practiceCount;
      let completed = false;
      try { completed = await kit.part(stage, async (part, target) => {
        await runStep(part, target, step);
        return true;
      }) === true; }
      catch (err) { if (kit.closed) return; console.error('step failed', step, err); }
      if (skipGroup) { while (groups[i + 1] === g) i++; skipGroup = false; }
      if (kit.closed) return;
      if (breaks.finishStep(completed && kit.practiceCount > before, i + 1 < plan.steps.length)) {
        progress((i + 1) / plan.steps.length);
        await playSoccer();
      }
      if (kit.closed) return;
      paintBreakProgress();
    }
    if (kit.closed) return;
    host.querySelector('.session-skip')?.remove();
    breakProgress.remove();
    progress(1);
    await kit.record('session', kit.sessionId, 'first-try', 'tap', {
      plannedMin: profile.settings.minutes, durationMs: Math.max(0, clock.now() - t0 - soccerMs), soccerMs, goals: kit.goals, steps: plan.steps.length, extra: !!params?.extra,
      ...(params?.topic ? { topic: params.topic } : {}),
      micFallback: kit.reader.independentReader?.fallback ?? kit.grownUpMode,
      independent: kit.independent,
    });
    void this.ctx.sync.sync();
    await this.fullTime(stage, kit.goals);
  }

  dispose(): void {
    this.kit?.cancel();
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
  private async kickoff(kit: Kit, stage: HTMLElement, steps: Step[]): Promise<void> {
    const count = (g: string): number => steps.filter((st) => this.group(st) === g).length;
    const parts: [string, string][] = [
      ['🎵', count('warmup') ? (count('warmup') > 1 ? `${count('warmup')} sound games` : 'A sound game') : ''],
      ['🔁', count('review') ? `${count('review')} words to review` : ''],
      ['⭐', count('new-word') ? `${count('new-word')} new words` : ''],
      ['🏆', count('challenge') ? '1 challenge word' : ''],
      ['✏️', count('write') ? 'Write a word' : ''],
      ['📖', count('sentence') ? 'Read a sentence' : ''],
      ['📘', count('story') ? 'A story with 3 questions' : ''],
      ['🎮', count('game') ? `${count('game')} games` : ''],
      ['⏱️', count('fluency') ? 'A one-minute read' : ''],
    ];
    const t = this.ctx.i18n;
    await new Promise<void>((resolve) => replace(stage, h('div', { class: 'stage center' },
      h('h2', {}, 'Today’s match'),
      h('ol', { class: 'plan-list' }, parts.filter(([, text]) => text).map(([icon, text]) => h('li', {}, h('span', { 'aria-hidden': 'true' }, icon), ` ${text}`))),
      h('button', { class: 'kickoff compact', onClick: async () => { await kit.ctx.audio.unlock(); resolve(); } },
        h('span', { class: 'kickoff-ball', 'aria-hidden': 'true' }, '⚽'), h('span', {}, 'Kick off!')),
      this.kit?.independent ? null : h('div', { class: 'grownup-note', lang: t.locale }, h('b', {}, `👪 ${t.t('howto.grownup')}: `), t.t('plan.grownup')))));
    await kit.prompt('start');
  }

  private async fullTime(stage: HTMLElement, goals: number): Promise<void> {
    const p = this.ctx.player();
    if (!p) return;
    const t = trophies(await this.ctx.log.events(p.id), this.ctx.clock.today());
    const independent = p.settings.checkMode === 'independent';
    const blocksNow = Math.floor(goals / GOALS_PER_BLOCK);
    replace(stage, h('div', { class: 'stage center fulltime' },
      h('div', { class: 'whistle', 'aria-hidden': 'true' }, '🏆'),
      h('h1', {}, 'Full time!'),
      h('p', { class: 'lead' }, independent ? 'You practiced today! ⭐' : `You scored ${goals} goal${goals === 1 ? '' : 's'}!`),
      blocksNow ? h('p', { class: 'lead' }, `+${blocksNow} 🧱 for your stadium`) : null,
      t.next ? h('p', { class: 'small' }, `${t.blocksToNext} more blocks for the ${t.next.name.toLowerCase()} ${t.next.emoji}`) : null,
      h('div', { class: 'row center' },
        h('button', { class: independent ? 'btn soft' : 'btn big', onClick: () => this.ctx.navigate('session', { extra: true }) }, '⏱ Extra time'),
        h('button', { class: independent ? 'btn soft' : 'btn big ok', onClick: () => this.ctx.navigate('stadium') }, '🏟️ My stadium')),
      h('button', { class: independent ? 'btn big ok' : 'btn link', onClick: () => this.ctx.navigate('home') }, 'Done for today')));
    await this.ctx.audio.play(clipKey.prompt(independent ? 'finished-independent' : 'full-time'));
    await sleep(200);
  }
}
