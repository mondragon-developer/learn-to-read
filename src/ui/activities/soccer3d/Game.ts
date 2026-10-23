import { SoccerScene, RUNUP_MS, type Frame3 } from './Scene';
import { StadiumSound } from './Sound';
import { BALL_RADIUS, kick3, chooseKeeper3, resolve3, targetHit3, target3, clamp3, type Vec3, type Aim3, type Kick3, type Impact3, type Keeper3, type Mode3 } from '@domain/rewards/Soccer3D';
import { heldPower, soccerTotals } from '@domain/rewards/Soccer';
import type { Kit } from '../kit';
import { h, replace } from '../../dom';

/** Returns false only when the simple renderer should take over. */
export async function play3D(kit: Kit, host: HTMLElement, options: { anytime?: boolean }): Promise<boolean> {
  if (kit.closed) return true;
  const totals = soccerTotals(await kit.ctx.log.events(kit.profile.id));
  if (kit.closed) return true;
  return new Promise<boolean>((resolve) => {
    let scene: SoccerScene | undefined, frame = 0, closed = false;
    let mode: Mode3 = 'penalties', round = 0, goals = 0, replayUsed = false, match = 0;
    let phase: Frame3['phase'] = 'invite', origin: Vec3 = { x: 0, y: BALL_RADIUS, z: 12 }, aim: Aim3 = { x: 0, y: 1.3 };
    let shot: Kick3 | undefined, impact: Impact3 | undefined, move: Keeper3 | undefined;
    let started = 0, resultAt = 0, hiddenAt: number | null = null, scored = false, kicked = false;
    let drag: { id: number; x: number; y: number; at: number; moved: boolean } | null = null;
    let keeperX = 0, last = 0, muted = false, low = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sound = new StadiumSound();
    const startFrame = (): void => { if (!frame && !closed && !document.hidden) frame = requestAnimationFrame(tick); };
    const finish = (supported = true): void => {
      if (closed) return; closed = true; cancelAnimationFrame(frame); frame = 0;
      document.removeEventListener('visibilitychange', visibility); kit.abort.signal.removeEventListener('abort', abort);
      scene?.dispose(); sound.dispose(); kit.ctx.audio.stop(); resolve(supported);
    };
    const abort = (): void => finish();
    const title = h('h2', { class: 'stadium-title' }, 'Your moment.');
    const status = h('p', { class: 'soccer-status', role: 'status' }, 'Three shots. Make them yours.');
    const dots = h('div', { class: 'soccer-shots', 'aria-label': 'Three shots remaining' });
    const tally = h('b', { class: 'stadium-score' }, '0');
    const lifetime = h('span', { class: 'soccer-totals' }, `Soccer goals: ${totals.goals} · Keeper saves: ${totals.saves}`);
    const field = h('div', { class: 'soccer-control stadium-view', tabindex: '0', role: 'group', 'aria-label': 'Hold the ball for power, drag to aim at the goal, then release. Arrow keys aim; Enter shoots.' });
    const marker = h('span', { class: 'stadium-ball-marker', 'aria-hidden': 'true' }, h('span', {}, 'HOLD & AIM'));
    const resultBadge = h('div', { class: 'stadium-result', 'aria-hidden': 'true' });
    const powerLabel = h('span', {}, 'Hold the ball for power');
    const power = h('div', { class: 'soccer-power stadium-power', role: 'meter', 'aria-label': 'Shot power', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, powerLabel);
    const play = h('button', { class: 'btn soccer-play stadium-play', onClick: () => { sound.unlock(); prepare(); field.focus({ preventScroll: true }); } }, 'Let’s play  →');
    const replay = h('button', { class: 'btn soccer-replay stadium-play', hidden: true, onClick: () => {
      if (phase !== 'done' || (!options.anytime && replayUsed)) return;
      replayUsed = true; round = goals = 0; match++; tally.textContent = '0'; prepare(); field.focus({ preventScroll: true });
    } }, 'Play another round  ↻');
    const back = h('button', { class: 'btn soft soccer-back', onClick: () => finish() }, options.anytime ? 'Back to reading' : 'Keep reading →');
    const audio = h('button', { class: 'stadium-icon', 'aria-label': 'Mute game sounds', 'aria-pressed': 'false', onClick: () => {
      muted = !muted; sound.setMuted(muted); if (muted) kit.ctx.audio.stop();
      audio.textContent = muted ? 'Sound off' : 'Sound on'; audio.setAttribute('aria-pressed', String(muted)); audio.setAttribute('aria-label', muted ? 'Unmute game sounds' : 'Mute game sounds');
    } }, 'Sound on');
    const quality = h('button', { class: 'stadium-icon', 'aria-label': 'Use lighter graphics', 'aria-pressed': 'false', onClick: () => {
      low = !low; scene?.setQuality(low); quality.textContent = low ? 'Graphics: Light' : 'Graphics: Auto'; quality.setAttribute('aria-pressed', String(low)); quality.setAttribute('aria-label', low ? 'Use automatic graphics' : 'Use lighter graphics'); startFrame();
    } }, 'Graphics: Auto');
    const modes = (['penalties', 'free-kicks', 'targets'] as const).map((value, i) => h('button', { class: 'btn soft', 'aria-pressed': String(mode === value), onClick: () => {
      if (phase === 'flight' || phase === 'result') return;
      mode = value; round = goals = 0; match++; origin = { x: 0, y: BALL_RADIUS, z: value === 'free-kicks' ? 14 : 12 }; tally.textContent = '0';
      modes.forEach((button, index) => button.setAttribute('aria-pressed', String(index === i))); prepare();
    } }, ['Penalties', 'Free kicks', 'Targets'][i]));
    const position = h('fieldset', { class: 'soccer-position stadium-position', hidden: true }, h('legend', {}, 'Ball position'));
    const positions = ([['Left', -3, 0], ['Center', 0, 0], ['Right', 3, 0], ['Near', 0, 9], ['Far', 0, 14]] as const).map(([label, x, z]) => {
      const button = h('button', { class: 'btn soft', onClick: () => { if (phase !== 'aim') return; if (z) origin.z = z; else origin.x = x; prepare(); } }, label);
      button.dataset.x = String(x); button.dataset.z = String(z); position.appendChild(button); return button;
    });
    const intro = h('div', { class: 'stadium-intro' }, h('span', { class: 'stadium-eyebrow' }, 'WELCOME TO DREAM ARENA'), title, status, h('div', { class: 'stadium-main-actions' }, play, replay));
    const hud = h('div', { class: 'stadium-hud' }, h('div', { class: 'stadium-player' }, h('span', { class: 'stadium-crest' }, String(kit.profile.number)), h('div', {}, h('b', {}, kit.profile.firstName), h('small', {}, 'DREAM TEAM'))), dots, h('div', { class: 'stadium-scorebox' }, tally, h('small', {}, 'GOALS')));
    field.append(marker, hud, intro, resultBadge, power);
    const panel = h('div', { class: 'stage soccer-stage soccer-stage-3d', 'data-renderer': 'three' },
      h('div', { class: 'stadium-topline' }, h('span', { class: 'stadium-brand' }, '★ DREAM ARENA'), h('div', { class: 'stadium-options' }, quality, audio)),
      field,
      h('div', { class: 'stadium-dock' }, h('nav', { class: 'soccer-modes', 'aria-label': 'Soccer game mode' }, modes), position,
        h('div', { class: 'stadium-bottom' }, lifetime, back)));
    replace(host, panel);
    function paint(): void {
      panel.dataset.phase = phase; panel.dataset.mode = mode; panel.dataset.round = String(round);
      panel.dataset.originX = String(origin.x); panel.dataset.originZ = String(origin.z);
      replace(dots, [0, 1, 2].map((i) => h('i', { class: i < round ? 'used' : '', 'aria-hidden': 'true' }, i < round ? '✓' : '●')));
      dots.setAttribute('aria-label', `${3 - round} shots remaining`);
      position.hidden = mode === 'penalties';
      positions.forEach((button) => { button.disabled = phase !== 'aim'; button.setAttribute('aria-pressed', String(Number(button.dataset.z) ? origin.z === Number(button.dataset.z) : origin.x === Number(button.dataset.x))); });
      modes.forEach((button) => { button.disabled = phase === 'flight' || phase === 'result'; });
      marker.hidden = phase !== 'aim'; power.hidden = phase !== 'aim';
      play.hidden = phase !== 'invite'; replay.hidden = phase !== 'done' || (!options.anytime && replayUsed);
      intro.classList.toggle('compact', phase === 'aim' || phase === 'flight' || phase === 'result');
      field.dataset.aiming = String(phase === 'aim');
    }
    function prepare(): void {
      if (closed) return; phase = 'aim'; shot = undefined; impact = undefined; move = undefined; drag = null; scored = false; kicked = false;
      aim = mode === 'targets' ? target3(round) : { x: 0, y: 1.3 };
      title.textContent = `Shot ${round + 1} of 3`;
      status.textContent = mode === 'targets' ? 'Aim for the golden ring.' : mode === 'free-kicks' && round > 0 ? 'Find a way past the wall.' : 'Hold the ball. Aim. Release!';
      resultBadge.textContent = ''; panel.removeAttribute('data-outcome'); panel.removeAttribute('data-target-hit');
      power.setAttribute('aria-valuenow', '0'); power.style.setProperty('--power', '0%'); powerLabel.textContent = 'Hold the ball for power'; paint(); startFrame();
    }
    function launch(force: number): void {
      if (phase !== 'aim' || closed) return; sound.unlock(); shot = kick3(origin, aim, force); move = chooseKeeper3(shot, keeperX);
      impact = resolve3(shot, move, round, mode); phase = 'flight'; started = performance.now(); drag = null; kicked = false;
      title.textContent = 'Here we go!'; status.textContent = ''; paint(); startFrame();
    }
    function settle(now: number): void {
      if (!shot || !impact) return;
      scored = impact.outcome === 'goal' && (mode !== 'targets' || targetHit3(shot, round));
      if (scored) { goals++; totals.goals++; } if (impact.outcome === 'saved') totals.saves++;
      tally.textContent = String(goals); lifetime.textContent = `Soccer goals: ${totals.goals} · Keeper saves: ${totals.saves}`;
      void kit.ctx.log.record({ profileId: kit.profile.id, activity: 'soccer', itemId: `soccer:${kit.sessionId}:${match}:${round}`,
        outcome: 'unverified', source: 'tap', meta: { session: kit.sessionId, result: mode === 'targets' ? (scored ? 'goal' : 'target-miss') : impact.outcome, mode },
      }).then(() => kit.ctx.sync.sync()).catch(() => { lifetime.textContent += ' · Score could not be saved'; });
      panel.dataset.outcome = impact.outcome; panel.dataset.targetHit = String(mode === 'targets' && scored);
      const messages: Record<Impact3['outcome'], [string, string]> = {
        goal: ['GOOOAL!', 'Beautiful finish!'], saved: ['WHAT A SAVE!', 'Try a corner next time.'], wide: ['SO CLOSE!', 'Aim inside the white posts.'],
        short: ['A LITTLE MORE!', 'Hold longer to build power.'], post: ['OFF THE POST!', 'Just a little farther inside.'], bar: ['CROSSBAR!', 'Try aiming a little lower.'], wall: ['BLOCKED!', 'Look for space beside the wall.'],
      };
      const message = mode === 'targets' && impact.outcome === 'goal' ? scored ? ['TARGET HIT!', 'Right on the golden spot!'] : ['IN THE NET!', 'Try the golden ring next time.'] : messages[impact.outcome];
      resultBadge.textContent = message[0]!; resultBadge.classList.toggle('goal', scored); title.textContent = message[0]!; status.textContent = message[1]!;
      sound.impact(scored, impact.outcome === 'post' || impact.outcome === 'bar');
      if (!muted) void kit.prompt(scored ? 'goal' : 'so-close').catch(() => undefined);
      phase = 'result'; resultAt = now; paint();
    }
    field.addEventListener('pointerdown', (event) => {
      if (phase !== 'aim' || !scene || !event.isPrimary || event.button !== 0 || drag) return;
      const rect = field.getBoundingClientRect(), p = scene.project(origin);
      if (Math.hypot(event.clientX - rect.left - p.x, event.clientY - rect.top - p.y) > 65) return;
      event.preventDefault(); sound.unlock(); field.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now(), moved: false }; startFrame();
    });
    field.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id || !scene) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 12) { drag.moved = true; aim = scene.aimAt(event.clientX, event.clientY); }
    });
    field.addEventListener('pointerup', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const attempt = drag; drag = null;
      if (field.hasPointerCapture(event.pointerId)) field.releasePointerCapture(event.pointerId);
      if (attempt.moved) { aim = scene!.aimAt(event.clientX, event.clientY); launch(heldPower(performance.now() - attempt.at)); }
      else { power.setAttribute('aria-valuenow', '0'); power.style.setProperty('--power', '0%'); powerLabel.textContent = 'Drag from the ball toward the goal'; startFrame(); }
    });
    const cancelDrag = (): void => { drag = null; power.setAttribute('aria-valuenow', '0'); power.style.setProperty('--power', '0%'); startFrame(); };
    field.addEventListener('pointercancel', cancelDrag); field.addEventListener('lostpointercapture', () => { if (drag) cancelDrag(); });
    field.addEventListener('keydown', (event) => {
      if (phase !== 'aim') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); if (event.key === 'ArrowLeft') aim.x -= .55; if (event.key === 'ArrowRight') aim.x += .55;
        if (event.key === 'ArrowUp') aim.y += .22; if (event.key === 'ArrowDown') aim.y -= .22;
        aim.x = clamp3(aim.x, -6, 6); aim.y = clamp3(aim.y, .18, 4.3);
        status.textContent = 'Arrow keys aim. Enter shoots.'; startFrame();
      } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); launch(.85); }
    });
    function tick(now: number): void {
      frame = 0; if (closed || kit.closed) { finish(); return; }
      const dt = last ? Math.min(60, now - last) : 0; last = now;
      if (phase === 'aim' || phase === 'invite') keeperX += (Math.sin(now / 1400) * .65 - keeperX) * dt / 900;
      if (drag) { const percent = Math.round(heldPower(now - drag.at) / 1.15 * 100); power.setAttribute('aria-valuenow', String(percent)); power.style.setProperty('--power', `${percent}%`); powerLabel.textContent = `${percent}% power · release to shoot`; }
      if (phase === 'flight' && shot && impact) {
        if (now - started >= RUNUP_MS && !kicked) { sound.kick(); kicked = true; }
        if (now - started >= RUNUP_MS + shot.flightMs * impact.t) settle(now);
      } else if (phase === 'result' && now - resultAt > 2300) {
        round++;
        if (round < 3) prepare(); else { phase = 'done'; title.textContent = 'Great shooting!'; status.textContent = mode === 'targets' ? `${goals} of 3 targets hit. Want another round?` : `${goals} ${goals === 1 ? 'goal' : 'goals'}. Your next big moment is waiting.`; resultBadge.textContent = ''; paint(); back.focus({ preventScroll: true }); }
      }
      scene?.draw({ mode, round: Math.min(round, 2), origin, phase, now, keeperX, shot, move, impact,
        elapsed: phase === 'flight' ? now - started : phase === 'result' || phase === 'done' ? now - resultAt : 0, scored, aim: phase === 'aim' ? aim : undefined, aimPower: drag ? heldPower(now - drag.at) : .85 });
      if (scene && phase === 'aim') { const p = scene.project(origin); marker.style.left = `${p.x}px`; marker.style.top = `${p.y}px`; field.dataset.ballX = String(p.x); field.dataset.ballY = String(p.y); const goal = scene.project({ ...aim, z: 0 }); field.dataset.aimX = String(goal.x); field.dataset.aimY = String(goal.y); }
      if (phase !== 'done' && (!reduced || phase === 'flight' || phase === 'result' || drag)) startFrame();
    }
    function visibility(): void {
      if (document.hidden) { hiddenAt = performance.now(); cancelAnimationFrame(frame); frame = 0; drag = null; sound.stop(); kit.ctx.audio.stop(); }
      else if (hiddenAt !== null) { const delta = performance.now() - hiddenAt; started += delta; resultAt += delta; hiddenAt = null; last = 0; scene?.resetClock(); startFrame(); }
    }
    kit.abort.signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', visibility);
    try { scene = new SoccerScene(field, kit.profile, reduced, () => finish(false), startFrame); }
    catch { finish(false); return; }
    paint(); startFrame();
  });
}
