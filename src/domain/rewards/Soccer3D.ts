/** World-space soccer rules. Metres, y up, the goal line at z=0. No renderer dependency. */
export interface Vec3 { x: number; y: number; z: number }
export interface Aim3 { x: number; y: number }
export type Mode3 = 'free-kicks' | 'penalties' | 'targets' | 'keeper';
export type Outcome3 = 'goal' | 'saved' | 'wide' | 'short' | 'post' | 'bar' | 'wall';
export const GOAL = { halfWidth: 3.66, height: 2.44, depth: 1.65, post: .065 };
export const BALL_RADIUS = .18;
export const clamp3 = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export interface Kick3 { origin: Vec3; aim: Aim3; power: number; range: number; arc: number; flightMs: number }
export function kick3(origin: Vec3, aim: Aim3, power: number): Kick3 {
  power = clamp3(power, .12, 1.2);
  return { origin: { ...origin }, aim: { x: clamp3(aim.x, -6, 6), y: clamp3(aim.y, .18, 4.3) }, power,
    range: Math.min(1, power / (.36 + origin.z * .012)), arc: .35 + origin.z * .035,
    flightMs: (1400 - power * 400) * Math.sqrt(origin.z / 12) };
}
export function ball3(shot: Kick3, progress: number): Vec3 {
  const t = clamp3(progress, 0, shot.range), u = t / shot.range;
  return { x: mix(shot.origin.x, shot.aim.x, t), z: shot.origin.z * (1 - t),
    y: mix(BALL_RADIUS, shot.range < 1 ? BALL_RADIUS : shot.aim.y, u) + shot.arc * 4 * u * (1 - u) };
}
/** A dive moves the keeper's hips (`endX`, `endY`) and tilts his body around them; `start` is where his feet stood. */
export interface Keeper3 { start: number; endX: number; endY: number; angle: number; delay: number; duration: number }
/** Feet position and body tilt, the same frame the rig and save detection use. */
export interface KeeperPose3 { x: number; y: number; angle: number; dive: number }
/** One straight-arm model shared by the keeper mesh and save detection: shoulder pivot, reach and raise angles. */
export const KEEPER_ARM = { shoulderX: .32, shoulderY: 1.44, length: .58, ready: .55, raised: 2.7 };
/** Hip height: dives turn the body around here, so the whole keeper flies toward the ball instead of tipping over from his feet. */
export const KEEPER_HIPS = 1;
/** The hips travel at most 1.8 m sideways and rise at most 0.3 m (plus the leap's arc): the far post and top corner stay out of reach. */
export const KEEPER_LIMITS = { step: 1.8, jump: .3, tilt: 1.45, hold: 350, land: 380, lying: .3 };
const KEEPER_BODY = { y: 1.18, rx: .39, ry: .72, legs: .28 };
/** Torso and head ellipse plus the legs, in the keeper's own coordinates (feet at the origin). */
const bodyBlocks = (x: number, y: number, scale = 1): boolean =>
  Math.hypot(x / KEEPER_BODY.rx, (y - KEEPER_BODY.y) / KEEPER_BODY.ry) <= scale || (Math.abs(x) < KEEPER_BODY.legs * scale && y > -.1 && y < .6);
export const keeperRaise = (dive: number): number => mix(KEEPER_ARM.ready, KEEPER_ARM.raised, dive);
export function keeperGlove(side: number, dive: number): Aim3 {
  const a = keeperRaise(dive);
  return { x: side * (KEEPER_ARM.shoulderX + KEEPER_ARM.length * Math.sin(a)), y: KEEPER_ARM.shoulderY - KEEPER_ARM.length * Math.cos(a) };
}
export function rotateXY(x: number, y: number, angle: number): Aim3 {
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}
/** Hip position and body tilt that bring a raised glove closest to the target, keeping feet, gloves and body above the grass. */
export function keeperReach(target: Aim3, start: number): { x: number; y: number; angle: number } {
  // A ball into the body is blocked standing; anything else is reached for with a glove.
  if (bodyBlocks(target.x - start, target.y, .9)) return { x: start, y: KEEPER_HIPS, angle: 0 };
  const side = target.x >= start ? 1 : -1, glove = keeperGlove(side, 1);
  let best = { x: start, y: KEEPER_HIPS, angle: 0 }, bestScore = Infinity;
  for (let i = 0; i <= 29; i++) {
    const tilt = KEEPER_LIMITS.tilt * i / 29, angle = -side * tilt, g = rotateXY(glove.x, glove.y - KEEPER_HIPS, angle);
    const x = clamp3(target.x - g.x, start - KEEPER_LIMITS.step, start + KEEPER_LIMITS.step);
    const lowest = Math.max(KEEPER_HIPS * Math.cos(tilt), KEEPER_LIMITS.lying, .08 - g.y);
    const y = clamp3(target.y - g.y, lowest, KEEPER_HIPS + KEEPER_LIMITS.jump);
    const score = Math.hypot(x + g.x - target.x, y + g.y - target.y) + Math.abs(y - KEEPER_HIPS) * .05 + tilt * .02 + Math.max(0, side * (start - x)) * .3;
    if (score < bestScore) { bestScore = score; best = { x, y, angle }; }
  }
  return best;
}
export function diveTo3(target: Aim3, start: number, delay: number, duration = 420): Keeper3 {
  const end = keeperReach(target, start);
  return { start, endX: end.x, endY: end.y, angle: end.angle, delay, duration };
}
export function chooseKeeper3(shot: Kick3, start: number, random = Math.random): Keeper3 {
  const tracks = random() < .3, side = shot.aim.x >= start ? 1 : -1;
  return diveTo3(tracks ? shot.aim : { x: -side * 2.8, y: .9 }, start, 140 + random() * 80, Math.min(530, shot.flightMs - 250));
}
/** Feet position for hips at (x, y) with the body tilted by `angle`. */
const feetOf = (x: number, y: number, angle: number, dive: number): KeeperPose3 => {
  const up = rotateXY(0, KEEPER_HIPS, angle);
  return { x: x - up.x, y: y - up.y, angle, dive };
};
/** Leap: the hips arc toward the ball while the body leans in early; hold the stretch, then land on the side or the feet. */
export function keeper3(move: Keeper3, elapsed: number): KeeperPose3 {
  const t = clamp3((elapsed - move.delay) / move.duration, 0, 1), ease = t * t * (3 - 2 * t), lean = 1 - (1 - t) * (1 - t);
  const hipsX = mix(move.start, move.endX, ease), hipsY = mix(KEEPER_HIPS, move.endY, ease) + Math.sin(Math.PI * t) * .16 * Math.min(1, Math.abs(move.endX - move.start));
  const land = clamp3((elapsed - move.delay - move.duration - KEEPER_LIMITS.hold) / KEEPER_LIMITS.land, 0, 1);
  if (land === 0) return feetOf(hipsX, hipsY, move.angle * lean, ease);
  const lie = Math.abs(move.angle) > .7, fall = land * land;
  return feetOf(hipsX, mix(move.endY, lie ? KEEPER_LIMITS.lying : KEEPER_HIPS, fall), mix(move.angle, lie ? Math.sign(move.angle) * 1.5 : 0, fall), lie ? 1 : mix(1, .3, fall));
}
export function keeperTouches3(p: Vec3, pose: KeeperPose3): boolean {
  const local = rotateXY(p.x - pose.x, p.y - pose.y, -pose.angle);
  // Body, head and legs plus the same glove locations used by the rig.
  const body = bodyBlocks(local.x, local.y);
  const gloves = [-1, 1].some((side) => { const g = keeperGlove(side, pose.dive); return Math.hypot(local.x - g.x, local.y - g.y) < .31; });
  return body || gloves;
}
/** The computer striker when the child keeps goal: mostly on target and within a diving keeper's reach. */
export const STRIKER_POWER = .62;
export function strikerAim3(random = Math.random): Aim3 {
  const side = random() < .5 ? -1 : 1, roll = random();
  if (roll < .12) return { x: side * (GOAL.halfWidth + .5), y: .5 + random() };
  return { x: side * (.7 + random() * 2.2), y: .3 + random() * 1.6 };
}
/** The child's tap: close enough to the ball counts as reading it, and the dive is timed to meet it. */
export function childDive3(shot: Kick3, tap: Aim3, start: number, tappedAt: number): Keeper3 {
  const target = Math.hypot(tap.x - shot.aim.x, tap.y - shot.aim.y) < 1.1 ? shot.aim : tap;
  const duration = 380, arrival = shot.flightMs * (1 - .2 / shot.origin.z);
  return diveTo3(target, start, Math.max(tappedAt, arrival - duration - 40), duration);
}
export const standKeeper3 = (shot: Kick3, start: number): Keeper3 => ({ start, endX: start, endY: KEEPER_HIPS, angle: 0, delay: Math.max(0, shot.flightMs - 420), duration: 300 });
export function wall3(round: number, mode: Mode3): Vec3[] {
  if (mode !== 'free-kicks' || round === 0) return [];
  return [-.42, .42].map((x) => ({ x: x + (round === 2 ? 1.3 : 0), y: 0, z: 5.2 }));
}
export const target3 = (round: number): Aim3 => ({ x: [-2.6, 2.6, 0][round % 3]!, y: round % 3 === 2 ? 1.95 : 1.4 });
export const targetHit3 = (shot: Kick3, round: number): boolean => {
  const p = target3(round); return shot.range === 1 && Math.hypot(shot.aim.x - p.x, shot.aim.y - p.y) < .55;
};
export interface Impact3 { outcome: Outcome3; t: number; point: Vec3 }
export function resolve3(shot: Kick3, move: Keeper3, round: number, mode: Mode3): Impact3 {
  const result = (outcome: Outcome3, t: number): Impact3 => ({ outcome, t, point: ball3(shot, t) });
  for (const defender of wall3(round, mode)) {
    const t = 1 - defender.z / shot.origin.z;
    const p = ball3(shot, t), jump = .22 * Math.sin(Math.PI * t);
    if (t > 0 && t <= shot.range && Math.abs(p.x - defender.x) < .44 && p.y < 1.98 + jump + BALL_RADIUS) return result('wall', t);
  }
  if (shot.range < 1) return result('short', shot.range);
  const { x, y } = shot.aim;
  const r = BALL_RADIUS + GOAL.post;
  if (Math.abs(y - GOAL.height) < r && Math.abs(x) <= GOAL.halfWidth + r) return result('bar', 1);
  if (Math.abs(Math.abs(x) - GOAL.halfWidth) < r && y <= GOAL.height + r) return result('post', 1);
  if (Math.abs(x) > GOAL.halfWidth || y > GOAL.height) return result('wide', 1);
  const keeperT = 1 - .2 / shot.origin.z;
  if (mode !== 'targets' && keeperTouches3(ball3(shot, keeperT), keeper3(move, shot.flightMs * keeperT))) return result('saved', keeperT);
  return result('goal', 1);
}
