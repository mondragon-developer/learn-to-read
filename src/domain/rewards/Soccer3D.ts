/** World-space soccer rules. Metres, y up, the goal line at z=0. No renderer dependency. */
export interface Vec3 { x: number; y: number; z: number }
export interface Aim3 { x: number; y: number }
export type Mode3 = 'free-kicks' | 'penalties' | 'targets';
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
export interface Keeper3 { start: number; endX: number; endY: number; angle: number; delay: number; duration: number }
export interface KeeperPose3 { x: number; y: number; angle: number; dive: number }
export const KEEPER_GLOVE = { x: .88, y: 1.27 };
export function rotateXY(x: number, y: number, angle: number): Aim3 {
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}
export function chooseKeeper3(shot: Kick3, start: number, random = Math.random): Keeper3 {
  const tracks = random() < .3;
  const side = shot.aim.x >= start ? 1 : -1;
  const diveSide = tracks ? side : -side;
  const angle = -diveSide * .9;
  const hand = rotateXY(diveSide * KEEPER_GLOVE.x, KEEPER_GLOVE.y, angle);
  return { start, endX: tracks ? shot.aim.x - hand.x : diveSide * 2.6,
    endY: tracks ? Math.max(0, shot.aim.y - hand.y) : .15,
    angle, delay: 140 + random() * 80, duration: Math.min(530, shot.flightMs - 250) };
}
export function keeper3(move: Keeper3, elapsed: number): KeeperPose3 {
  const t = clamp3((elapsed - move.delay) / move.duration, 0, 1), ease = t * t * (3 - 2 * t);
  return { x: mix(move.start, move.endX, ease), y: move.endY * ease + Math.sin(Math.PI * t) * .22,
    angle: move.angle * ease, dive: ease };
}
export function keeperTouches3(p: Vec3, pose: KeeperPose3): boolean {
  const local = rotateXY(p.x - pose.x, p.y - pose.y, -pose.angle);
  // Body/head capsules plus the same outstretched hand locations used by the rig.
  const body = Math.hypot(local.x / .39, (local.y - 1.18) / .72) <= 1;
  const gloves = [-1, 1].some((side) => Math.hypot(local.x - side * KEEPER_GLOVE.x, local.y - KEEPER_GLOVE.y) < .31);
  return body || gloves;
}
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
