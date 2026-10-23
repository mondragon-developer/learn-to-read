import { BALL, aimedShot, ballAt, clamp, hitsTarget, targetFor, type BallPosition, type SoccerMode, keeperMove, keeperPose, resolveShot, soccerTotals, dragShot, heldPower, type Shot, type ShotResult } from '@domain/rewards/Soccer';
import type { Kit } from './kit';
import { h, replace, svg } from '../dom';
import { dressPlayer, playerArt } from './soccerPlayer';

export async function soccerBreak(kit: Kit, host: HTMLElement, options: { anytime?: boolean } = {}): Promise<void> {
  if (kit.closed) return;
  const totals = soccerTotals(await kit.ctx.log.events(kit.profile.id));
  if (kit.closed) return;
  await new Promise<void>((resolve) => {
    let frame = 0;
    let closed = false;
    let round = 0;
    let goals = 0;
    let replayUsed = false;
    let mode: SoccerMode = 'free-kicks';
    let origin: BallPosition = { ...BALL };
    let hiddenAt: number | null = null;
    let phase: 'invite' | 'aim' | 'flight' | 'result' | 'done' = 'invite';
    let muted = false;
    let keeperX = 320;
    let keeperTarget = 320;
    let nextShuffle = 0;
    let lastFrame = 0;
    let shotStart = 0;
    let resultUntil = 0;
    let shot: Shot | null = null;
    let impact: ShotResult | null = null;
    let resultStart = 0;
    let move: ReturnType<typeof keeperMove> | null = null;
    let drag: { id: number; x: number; y: number; at: number; aimX: number; aimY: number } | null = null;
    let keyboardX = 320;
    let keyboardPower = 0.85;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = (): void => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      kit.ctx.audio.stop();
      kit.abort.signal.removeEventListener('abort', finish);
      resolve();
    };
    kit.abort.signal.addEventListener('abort', finish, { once: true });
    const say = (id: string): void => { if (!muted && !closed) void kit.prompt(id).catch(() => undefined); };
    const title = h('h2', {}, 'Soccer time!');
    const status = h('p', { class: 'soccer-status', role: 'status' }, 'Three shots. You’re the kicker!');
    const lifetime = h('p', { class: 'soccer-totals' }, `${kit.profile.firstName} · Soccer goals: ${totals.goals} · Keeper saves: ${totals.saves}`);
    const dots = h('div', { class: 'soccer-shots', 'aria-label': 'Three shots remaining' });
    const art = svg('0 0 640 440', `
      <defs>
        <linearGradient id="soccer-sky" x2="0" y2="1"><stop stop-color="#b8e5fa"/><stop offset="1" stop-color="#effbff"/></linearGradient>
        <pattern id="soccer-net" width="20" height="17" patternUnits="userSpaceOnUse"><path d="M20 0H0V17" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="1.5"/></pattern>
      </defs>
      <rect width="640" height="440" fill="#4da878"/>
      <path d="M0 0H640V132H0Z" fill="url(#soccer-sky)"/>
      <path d="M0 85Q100 50 190 83T390 77T640 82V145H0Z" fill="#7eb99b"/>
      <path d="M0 111H640V144H0Z" fill="#295b5e"/>
      <path d="M0 119H640M0 133H640" stroke="#ffc86a" stroke-width="5" stroke-dasharray="5 16" opacity=".8"/>
      <path d="M0 210H640V265H0ZM0 330H640V395H0Z" fill="#43976b"/>
      <path d="M0 440L230 144M150 440L270 144M490 440L370 144M640 440L410 144" fill="none" stroke="#a2cf83" stroke-opacity=".14" stroke-width="32"/>
      <path d="M130 199L46 436M510 199L594 436M94 300H546M240 300Q320 357 400 300" fill="none" stroke="#e0f4cc" stroke-width="3" opacity=".7"/>
      <path d="M135 200L153 80H487L505 200Z" fill="#183f42" opacity=".45"/>
      <path class="soccer-net" d="M135 200L153 80H487L505 200Z" fill="url(#soccer-net)"/>
      <path d="M135 200L153 80H487L505 200" fill="none" stroke="#f8ffff" stroke-width="9" stroke-linejoin="round"/>
      <circle class="soccer-target" cx="215" cy="140" r="34" visibility="hidden"/>
      <g class="soccer-keeper" transform="translate(320 174)"><g transform="translate(0 38)">${playerArt(true)}</g></g>
      <g class="soccer-wall" visibility="hidden"><g transform="translate(280 263)">${playerArt()}</g><g transform="translate(324 263)">${playerArt()}</g></g>
      <ellipse class="soccer-ball-shadow" cx="320" cy="400" rx="24" ry="7" fill="#153c32" opacity=".22"/>
      <g class="soccer-kicker" transform="translate(266 399)">${playerArt()}</g>
      <path class="soccer-trail" d="" fill="none" stroke="#fff1a8" stroke-width="5" stroke-dasharray="2 13" stroke-linecap="round"/>
      <g class="soccer-ball" transform="translate(320 390)">
        <circle r="33" fill="transparent"/><circle r="21" fill="#fff" stroke="#163c37" stroke-width="2"/>
        <path d="M0-9L9-3 6 8H-6L-9-3ZM-18-9L-10-17-9-10-16-4ZM18-9L10-17 9-10 16-4ZM-12 16L-5 19-4 12-10 10ZM12 16L5 19 4 12 10 10Z" fill="#243b4c"/>
      </g>
      <g class="soccer-sparkles" visibility="hidden" fill="#fff1a8"><path d="M90 80l5 12 13 5-13 5-5 12-5-12-13-5 13-5ZM550 65l5 12 13 5-13 5-5 12-5-12-13-5 13-5ZM530 240l5 12 13 5-13 5-5 12-5-12-13-5 13-5Z"/></g>
    `, 'soccer-field');
    art.setAttribute('aria-hidden', 'true');
    const el = <T extends SVGElement>(selector: string): T => art.querySelector<T>(selector)!;
    const keeper = el<SVGGElement>('.soccer-keeper');
    const ball = el<SVGGElement>('.soccer-ball');
    const kicker = el<SVGGElement>('.soccer-kicker');
    const wall = el<SVGGElement>('.soccer-wall');
    const trail = el<SVGPathElement>('.soccer-trail');
    const shadow = el<SVGEllipseElement>('.soccer-ball-shadow');
    const target = el<SVGCircleElement>('.soccer-target');
    const arms = keeper.querySelector('.soccer-arms')!;
    const gloves = keeper.querySelectorAll('.soccer-glove-left, .soccer-glove-right');
    const kickLeg = kicker.querySelector('.soccer-leg-right')!;
    const plantLeg = kicker.querySelector('.soccer-leg-left')!;
    const keeperLeft = keeper.querySelector('.soccer-leg-left')!;
    const keeperRight = keeper.querySelector('.soccer-leg-right')!;
    const startFrame = (): void => { if (!frame && !document.hidden && !closed) frame = requestAnimationFrame(tick); };
    const visibility = (): void => {
      if (document.hidden) { hiddenAt = performance.now(); cancelAnimationFrame(frame); frame = 0; drag = null; trail.setAttribute('d', ''); kit.ctx.audio.stop(); }
      else if (hiddenAt !== null) {
        const paused = performance.now() - hiddenAt;
        shotStart += paused; resultStart += paused; resultUntil += paused; nextShuffle += paused;
        hiddenAt = null; lastFrame = 0; if (phase !== 'done') startFrame();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    const sparkles = el<SVGGElement>('.soccer-sparkles');
    dressPlayer(kicker, kit.profile);
    const control = h('div', { class: 'soccer-control', role: 'button', tabindex: '0', 'aria-label': 'Hold the ball to charge, drag toward your target, then release. Or use left and right arrows to aim, up and down for power, then Enter to kick.' }, art);
    const powerMeter = h('div', { class: 'soccer-power', role: 'meter', 'aria-label': 'Shot power', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
      h('span', {}, 'Hold for power · drag to aim · release to shoot'));
    const play = h('button', { class: 'btn big ok soccer-play', onClick: () => {
      if (phase !== 'invite') return;
      play.hidden = true;
      prepare();
      control.focus({ preventScroll: true });
    } }, '⚽ Play');
    const back = h('button', { class: 'btn soft soccer-back', onClick: finish }, 'Keep reading →');
    const replay = h('button', { class: 'btn soft soccer-replay', hidden: true, onClick: () => {
      if (phase !== 'done' || (!options.anytime && replayUsed) || closed) return;
      replayUsed = true;
      replay.hidden = true;
      round = goals = 0;
      back.className = 'btn soft soccer-back';
      prepare();
      control.focus({ preventScroll: true });
      startFrame();
    } }, options.anytime ? '⚽ Play again' : '⚽ Play one more time');
    const sound = h('button', { class: 'btn small', 'aria-label': 'Mute game sounds', 'aria-pressed': 'false', onClick: () => {
      muted = !muted;
      sound.textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
      sound.setAttribute('aria-pressed', String(muted));
      sound.setAttribute('aria-label', muted ? 'Unmute game sounds' : 'Mute game sounds');
      if (muted) kit.ctx.audio.stop();
    } }, '🔊 Sound on');
    const modeButtons = (['free-kicks', 'penalties', 'targets'] as const).map((value, index) =>
      h('button', { class: 'btn soft', 'aria-pressed': String(mode === value), onClick: () => {
        if (phase === 'flight' || phase === 'result') return;
        mode = value; round = goals = 0; replayUsed = false; origin = { ...BALL };
        play.hidden = true; replay.hidden = true; prepare();
        modeButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
      } }, ['Free kicks', 'Penalties', 'Targets'][index]));
    const positions = h('fieldset', { class: 'soccer-position' }, h('legend', {}, 'Place your ball'));
    const positionButtons: HTMLButtonElement[] = [];
    for (const [label, x, y] of [['Left', 220, 0], ['Center', 320, 0], ['Right', 420, 0], ['Near', 0, 335], ['Far', 0, 390]] as const) {
      const button = h('button', { class: 'btn soft', onClick: () => {
        if (phase !== 'aim') return;
        if (x) origin.x = x; else origin.y = y;
        prepare();
      } }, label);
      button.dataset.x = String(x); button.dataset.y = String(y);
      positionButtons.push(button); positions.appendChild(button);
    }
    const panel = h('div', { class: 'stage soccer-stage' },
      h('div', { class: 'soccer-heading' }, h('span', { class: 'tag' }, 'SOCCER BREAK'), sound),
      h('nav', { class: 'soccer-modes', 'aria-label': 'Soccer game mode' }, modeButtons),
      title, status, lifetime, dots, control, positions, powerMeter,
      h('div', { class: 'row center soccer-actions' }, play, replay, back));
    replace(host, panel);
    function paintDots(): void {
      replace(dots, [0, 1, 2].map((i) => h('span', { class: `soccer-shot-dot ${i < round ? 'used' : ''}`, 'aria-hidden': 'true' }, i < round ? '✓' : '⚽')));
      dots.setAttribute('aria-label', `${3 - round} shots remaining`);
    }
    function prepare(): void {
      phase = 'aim';
      shot = null;
      impact = null;
      move = null;
      drag = null;
      keyboardX = 320;
      keyboardPower = 0.85;
      nextShuffle = 0;
      title.textContent = `Shot ${round + 1} of 3`;
      status.textContent = mode === 'targets' ? 'Hit the golden target!' : mode === 'free-kicks' && round > 0 ? 'Aim past the wall. Hold for power, then release!' : 'Hold the ball, drag to aim, then release!';
      positions.hidden = mode === 'penalties';
      positionButtons.forEach((b) => { b.disabled = false; b.setAttribute('aria-pressed', String(Number(b.dataset.x) ? origin.x === Number(b.dataset.x) : origin.y === Number(b.dataset.y))); });
      modeButtons.forEach((b) => { b.disabled = false; });
      const spot = targetFor(round);
      target.setAttribute('cx', String(spot.x)); target.setAttribute('cy', String(spot.y));
      target.setAttribute('visibility', mode === 'targets' ? 'visible' : 'hidden');
      keeper.setAttribute('visibility', mode === 'targets' ? 'hidden' : 'visible');
      kickLeg.removeAttribute('transform'); plantLeg.removeAttribute('transform');
      keeperLeft.removeAttribute('transform'); keeperRight.removeAttribute('transform');
      back.textContent = options.anytime ? 'Back to where I was →' : 'Back to practice →';
      ball.setAttribute('transform', `translate(${origin.x} ${origin.y})`);
      kicker.setAttribute('transform', `translate(${origin.x - 54} ${origin.y + 9})`);
      shadow.setAttribute('cx', String(origin.x)); shadow.setAttribute('cy', String(origin.y + 10)); shadow.setAttribute('rx', '24'); shadow.setAttribute('opacity', '.22');
      wall.setAttribute('visibility', mode === 'free-kicks' && round ? 'visible' : 'hidden');
      wall.setAttribute('transform', `translate(${round === 2 ? 65 : 0} 0)`);
      sparkles.setAttribute('visibility', 'hidden');
      trail.setAttribute('d', '');
      panel.classList.remove('soccer-scored');
      panel.removeAttribute('data-outcome');
      arms?.setAttribute('d', 'M-15-51L-33-43M15-51L33-43');
      gloves.forEach((g) => g.setAttribute('cy', '-43'));
      powerMeter.setAttribute('aria-valuenow', '0');
      powerMeter.style.setProperty('--power', '0%');
      powerMeter.firstElementChild!.textContent = 'Hold for power · drag to aim · release to shoot';
      control.setAttribute('aria-disabled', 'false');
      paintDots();
      startFrame();
    }
    function launch(next: Shot): void {
      if (phase !== 'aim' || closed) return;
      shot = next;
      move = keeperMove(next, keeperX, round);
      impact = resolveShot(next, move, mode === 'free-kicks' ? round : 0, mode !== 'targets');
      positionButtons.forEach((b) => { b.disabled = true; }); modeButtons.forEach((b) => { b.disabled = true; });
      shotStart = performance.now();
      phase = 'flight';
      drag = null;
      trail.setAttribute('d', '');
      status.textContent = 'Here comes your shot!';
      control.setAttribute('aria-disabled', 'true');
      startFrame();
    }
    const point = (event: PointerEvent): { x: number; y: number } => {
      const rect = art.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * 640 / rect.width, y: (event.clientY - rect.top) * 440 / rect.height };
    };
    const showAim = (aim: Shot | null): void => {
      const p = aim ? ballAt(aim, 1) : null;
      trail.setAttribute('d', p ? `M${origin.x} ${origin.y}Q${origin.x} ${origin.y - 70} ${p.x} ${p.y}` : '');
      const pct = aim ? Math.min(100, Math.round(aim.power / 1.15 * 100)) : 0;
      powerMeter.setAttribute('aria-valuenow', String(pct));
      powerMeter.style.setProperty('--power', `${pct}%`);
      powerMeter.firstElementChild!.textContent = !aim ? 'Hold for power · drag to aim' : aim.power < .5 ? 'Soft kick' : aim.power > 1.2 ? 'Big kick!' : 'Ready to shoot!';
    };
    control.addEventListener('pointerdown', (event) => {
      if (phase !== 'aim' || drag || !event.isPrimary || event.button !== 0) return;
      const p = point(event);
      if (Math.hypot(p.x - origin.x, p.y - origin.y) > 65) return;
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, ...p, at: performance.now(), aimX: 0, aimY: 0 };
      startFrame();
    });
    control.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const p = point(event);
      drag.aimX = p.x - drag.x;
      drag.aimY = p.y - drag.y;
    });
    control.addEventListener('pointerup', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const p = point(event);
      const next = dragShot(p.x - drag.x, p.y - drag.y, performance.now() - drag.at, origin);
      drag = null;
      trail.setAttribute('d', '');
      if (control.hasPointerCapture(event.pointerId)) control.releasePointerCapture(event.pointerId);
      if (next) launch(next);
      else showAim(null);
      if (!next) status.textContent = 'Hold the ball, drag toward the goal, then release!';
    });
    const cancelDrag = (): void => { drag = null; showAim(null); };
    control.addEventListener('pointercancel', cancelDrag);
    control.addEventListener('lostpointercapture', cancelDrag);
    control.addEventListener('keydown', (event) => {
      if (phase !== 'aim') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') keyboardX = clamp(keyboardX + (event.key === 'ArrowLeft' ? -40 : 40), 30, 610);
        else keyboardPower = clamp(keyboardPower + (event.key === 'ArrowUp' ? .15 : -.15), .15, 1.6);
        showAim(aimedShot(keyboardX, keyboardPower, origin));
        status.textContent = `Aim ${keyboardX < 290 ? 'left' : keyboardX > 350 ? 'right' : 'middle'}. ↑↓ power. Enter to kick.`;
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        launch(aimedShot(keyboardX, keyboardPower, origin));
      }
    });
    function tick(now: number): void {
      frame = 0;
      if (closed || kit.closed) { finish(); return; }
      const dt = Math.min(50, now - (lastFrame || now));
      lastFrame = now;
      if (phase === 'aim' || phase === 'invite') {
        if (drag) {
          const elapsed = now - drag.at;
          showAim(dragShot(drag.aimX, drag.aimY, elapsed, origin));
          const pct = Math.round(heldPower(elapsed) / 1.15 * 100);
          powerMeter.setAttribute('aria-valuenow', String(pct));
          powerMeter.style.setProperty('--power', `${pct}%`);
          powerMeter.firstElementChild!.textContent = `${pct}% power · drag to aim · release to shoot`;
        }
        if (now >= nextShuffle) {
          keeperTarget = 265 + Math.random() * 110;
          nextShuffle = now + 950 + Math.random() * 600;
        }
        if (!reduced) keeperX += clamp(keeperTarget - keeperX, -dt * 0.045, dt * 0.045);
        keeper.setAttribute('transform', `translate(${keeperX} 174)`);
        const step = !reduced && Math.abs(keeperTarget - keeperX) > 2 ? Math.sin(now / 95) * 11 : 0;
        keeperLeft.setAttribute('transform', `rotate(${step} -10 -24)`);
        keeperRight.setAttribute('transform', `rotate(${-step} 10 -24)`);
      } else if (phase === 'flight' && shot && move && impact) {
        const elapsed = Math.max(0, now - shotStart - 240);
        const t = clamp(elapsed / shot.flightMs, 0, impact.progress);
        const k = keeperPose(shot, move, elapsed);
        if (!reduced || t === impact.progress) {
          const { x, y } = ballAt(shot, t);
          ball.setAttribute('transform', `translate(${x} ${y}) scale(${1 - 0.52 * t}) rotate(${t * 300})`);
          keeper.setAttribute('transform', `translate(${k.x} ${k.y}) rotate(${k.angle})`);
          const windup = clamp((now - shotStart) / 240, 0, 1);
          const follow = clamp(elapsed / 340, 0, 1);
          kicker.setAttribute('transform', `translate(${origin.x - 54 + 28 * windup} ${origin.y + 9 - 12 * windup}) rotate(${-8 * windup})`);
          // Contact coincides with flight starting at 240ms; the leg then follows through.
          const kickAngle = windup < .6 ? 32 * Math.sin(windup / .6 * Math.PI / 2)
            : windup < 1 ? 32 - (windup - .6) / .4 * 87 : -55 * (1 - follow);
          kickLeg.setAttribute('transform', `rotate(${kickAngle} 10 -24)`);
          plantLeg.setAttribute('transform', `rotate(${8 * windup} -10 -24)`);
          const groundY = origin.y + (200 - origin.y) * t;
          shadow.setAttribute('cx', String(x)); shadow.setAttribute('cy', String(groundY + 8));
          shadow.setAttribute('rx', String(24 * (1 - .52 * t)));
          shadow.setAttribute('opacity', String(.22 - .12 * Math.sin(Math.PI * t)));
          wall.setAttribute('transform', `translate(${round === 2 ? 65 : 0} ${-18 * Math.sin(Math.PI * t)})`);
          const handY = k.handY;
          arms?.setAttribute('d', `M-15-51L-33 ${handY}M15-51L33 ${handY}`);
          gloves.forEach((g) => g.setAttribute('cy', String(handY)));
        }
        if (t === impact.progress) {
          const scored = impact.outcome === 'goal' && (mode !== 'targets' || hitsTarget(shot, round));
          panel.dataset.targetHit = String(mode === 'targets' && scored);
          if (scored) { goals++; totals.goals++; }
          if (impact.outcome === 'saved') totals.saves++;
          lifetime.textContent = `${kit.profile.firstName} · Soccer goals: ${totals.goals} · Keeper saves: ${totals.saves}`;
          void kit.ctx.log.record({ profileId: kit.profile.id, activity: 'soccer',
            itemId: `soccer:${kit.sessionId}:${Date.now()}:${round}`,
            outcome: 'unverified', source: 'tap', meta: { session: kit.sessionId, result: mode === 'targets' ? (scored ? 'goal' : 'target-miss') : impact.outcome, mode },
          }).then(() => kit.ctx.sync.sync()).catch((error: unknown) => {
            console.error('Could not save soccer shot', error);
            lifetime.textContent += ' · Could not save this shot';
          });
          round++;
          phase = 'result';
          resultStart = now;
          resultUntil = now + 1500;
          const messages = {
            goal: ['You scored!', 'GOOOAL! Great shot!'],
            saved: ['What a save!', 'The keeper caught it! Try a corner.'],
            wide: ['So close!', 'That went outside! Aim inside the goal.'],
            short: ['A little more power!', 'Hold the ball a little longer next time.'],
            post: ['Off the post!', 'Almost! Try a little farther inside.'],
            bar: ['Off the crossbar!', 'Almost! Aim a little lower.'],
            wall: ['Blocked by the wall!', 'Try the open side or a stronger kick.'],
          };
          const message = mode === 'targets' && impact.outcome === 'goal' ? (scored ? ['Target hit!', 'Right on the golden spot!'] : ['In the goal!', 'Try the golden spot next time.']) : messages[impact.outcome];
          title.textContent = message[0]!;
          status.textContent = message[1]!;
          panel.dataset.outcome = impact.outcome;
          panel.classList.toggle('soccer-scored', scored);
          sparkles.setAttribute('visibility', scored ? 'visible' : 'hidden');
          say(scored ? 'goal' : 'so-close');
          paintDots();
        }
      } else if (phase === 'result' && now < resultUntil && impact && !reduced) {
        const bounce = clamp((now - resultStart) / 650, 0, 1);
        if (['wall', 'post', 'bar'].includes(impact.outcome)) {
          ball.setAttribute('transform', `translate(${impact.x + (impact.x < 320 ? 32 : -32) * bounce} ${impact.y + 55 * bounce - 20 * Math.sin(Math.PI * bounce)}) scale(${1 - .52 * impact.progress})`);
        } else if (impact.outcome === 'short') {
          const ground = origin.y - (origin.y - 200) * impact.progress;
          ball.setAttribute('transform', `translate(${impact.x} ${impact.y + (ground - impact.y) * bounce}) scale(${1 - .52 * impact.progress})`);
        }
      } else if (phase === 'result' && now >= resultUntil) {
        if (round < 3) prepare();
        else {
          phase = 'done';
          title.textContent = 'Great shooting!';
          status.textContent = mode === 'targets' ? `${goals} of 3 targets hit!` : `${goals} ${goals === 1 ? 'goal' : 'goals'}! Great practice.`;
          modeButtons.forEach((b) => { b.disabled = false; });
          positionButtons.forEach((b) => { b.disabled = true; });
          kicker.setAttribute('transform', 'translate(300 370) rotate(-8)');
          sparkles.setAttribute('visibility', 'visible');
          back.className = 'btn big ok soccer-back';
          replay.hidden = !options.anytime && replayUsed;
          back.focus({ preventScroll: true });
        }
      }
      if (phase !== 'done' && (!reduced || drag || phase === 'flight' || phase === 'result')) startFrame();
    }
    paintDots();
    frame = requestAnimationFrame(tick);
  });
}
