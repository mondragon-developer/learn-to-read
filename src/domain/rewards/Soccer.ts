import type { PracticeEvent } from '../storage/events';

/** Soccer is a play break. Its results never become reading assessments or rewards. */
export const BALL = { x: 320, y: 390 };
export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
export interface BallPosition { x: number; y: number }
export type SoccerMode = 'free-kicks' | 'penalties' | 'targets';
export interface Shot { x: number; y: number; flightMs: number; power: number; range: number; arc: number; origin?: BallPosition }

export function aimedShot(x: number, power: number, origin: BallPosition = BALL): Shot {
  power = clamp(power, 0.12, 1.6);
  const distance = Math.max(.6, (origin.y - 200) / (BALL.y - 200));
  const effective = power / distance;
  return { x: clamp(x, 30, 610), y: 200 - (effective - 0.35) * 135,
    power, range: Math.min(1, effective / 0.5), arc: 20 + effective * 65,
    flightMs: (1450 - power * 380) * distance, origin: { ...origin } };
}

/** Hold to charge; drag position controls aim independently of power and gesture speed. */
export function heldPower(elapsedMs: number): number {
  return 0.25 + clamp(elapsedMs / 1400, 0, 1) * 0.9;
}

/** Coordinates use the field's 640 × 440 viewBox, independent of screen size. */
export function dragShot(dx: number, dy: number, elapsedMs: number, origin: BallPosition = BALL): Shot | null {
  if (dy > -12 || Math.hypot(dx, dy) < 18) return null;
  return { ...aimedShot(origin.x + dx, heldPower(elapsedMs), origin), y: clamp(origin.y + dy, 30, 360) };
}

export interface KeeperMove { startX: number; x: number; y: number; delayMs: number; moveMs: number }
export function keeperMove(shot: Shot, startX: number, _round: number, random = Math.random): KeeperMove {
  // One decision per kick: about three saves in ten on-target shots, at every round.
  // On misses the keeper dives away, so the rendered pose agrees with collision checks.
  const tracksBall = random() < 0.3;
  return {
    startX, x: tracksBall ? shot.x : (shot.x < 320 ? 470 : 170),
    y: tracksBall ? shot.y : 174,
    delayMs: 220 + random() * 90,
    moveMs: 600,
  };
}

export function keeperAt(move: KeeperMove, elapsedMs: number): { x: number; y: number } {
  const t = clamp((elapsedMs - move.delayMs) / move.moveMs, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return { x: move.startX + (move.x - move.startX) * eased, y: 174 + (move.y - 174) * eased };
}

/** Shared by the SVG and hit detection so a diving glove can really save the ball. */
export function keeperPose(shot: Shot, move: KeeperMove, elapsedMs: number): { x: number; y: number; angle: number; handY: number } {
  const keeper = keeperAt(move, elapsedMs);
  const lift = clamp((174 - shot.y) / 70, 0, 1) * clamp((elapsedMs - move.delayMs) / 200, 0, 1);
  return { ...keeper, angle: clamp((keeper.x - move.startX) * 0.5, -45, 45), handY: -43 - 35 * lift };
}

export function isSaved(shot: Shot, move: KeeperMove): boolean {
  const keeper = keeperPose(shot, move, shot.flightMs);
  const angle = keeper.angle * Math.PI / 180;
  const dx = shot.x - keeper.x;
  const dy = shot.y - keeper.y;
  // Undo the rendered rotation; body and gloves now share the player's local coordinates.
  const x = dx * Math.cos(angle) + dy * Math.sin(angle);
  const y = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.hypot(x / 44, y / 34) <= 1
    || [-1, 1].some((side) => Math.hypot(x - side * 33, y - (38 + keeper.handY)) < 22);
}

export function ballAt(shot: Shot, progress: number): { x: number; y: number } {
  const t = clamp(progress, 0, shot.range);
  const origin = shot.origin ?? BALL;
  return { x: origin.x + (shot.x - origin.x) * t,
    y: origin.y + (shot.y - origin.y) * t - shot.arc * Math.sin(Math.PI * t) };
}

export const targetFor = (round: number): { x: number; y: number; radius: number } =>
  ({ x: [215, 425, 320][round % 3]!, y: round % 3 === 2 ? 105 : 140, radius: 34 });
export const hitsTarget = (shot: Shot, round: number): boolean => {
  const target = targetFor(round);
  return shot.range === 1 && Math.hypot(shot.x - target.x, shot.y - target.y) <= target.radius;
};

export type ShotOutcome = 'goal' | 'saved' | 'wide' | 'short' | 'post' | 'bar' | 'wall';
export interface ShotResult { outcome: ShotOutcome; progress: number; x: number; y: number }
export const wallCenters = (round: number): number[] => round === 0 ? [] : [280, 324].map((x) => x + (round === 2 ? 65 : 0));

/** Collision order follows the flight: wall first, then range, frame, keeper and net. */
export function resolveShot(shot: Shot, move: KeeperMove, round: number, keeperEnabled = true): ShotResult {
  const result = (outcome: ShotOutcome, progress: number): ShotResult => ({ outcome, progress, ...ballAt(shot, progress) });
  const origin = shot.origin ?? BALL;
  const wallProgress = (origin.y - 263) / (origin.y - 200);
  if (shot.range >= wallProgress) {
    const p = ballAt(shot, wallProgress);
    const jump = 18 * Math.sin(Math.PI * wallProgress);
    if (wallCenters(round).some((x) => Math.abs(p.x - x) < 34) && p.y >= 174 - jump - 13 && p.y <= 263 - jump + 13) {
      return result('wall', wallProgress);
    }
  }
  if (shot.range < 1) return result('short', shot.range);
  // The rendered posts lean outwards toward the grass.
  const left = 153 - (clamp(shot.y, 80, 200) - 80) * 0.15;
  const right = 640 - left;
  if (shot.x >= 140 && shot.x <= 500 && Math.abs(shot.y - 80) <= 14) return result('bar', 1);
  if (shot.y >= 66 && shot.y <= 210 && Math.min(Math.abs(shot.x - left), Math.abs(shot.x - right)) <= 14) return result('post', 1);
  if (shot.x < left || shot.x > right || shot.y < 80 || shot.y > 200) return result('wide', 1);
  return result(keeperEnabled && isSaved(shot, move) ? 'saved' : 'goal', 1);
}

/** Completed steps, never individual taps. Leave at least one learning step after a break. */
export class SoccerBreaks {
  private completed = 0;
  private offered = 0;
  readonly interval: number;
  readonly limit: number;
  constructor(steps: number, minutes: number, enabled: boolean) {
    this.limit = enabled && steps >= 4 ? (minutes >= 10 && steps >= 7 ? 2 : 1) : 0;
    this.interval = Math.max(3, Math.ceil((steps - 1) / (this.limit + 1)));
  }
  get remaining(): number { return Math.max(0, this.interval - this.completed); }
  get available(): boolean { return this.offered < this.limit; }
  finishStep(participated: boolean, hasNext: boolean): boolean {
    if (participated) this.completed++;
    if (!this.available || !hasNext || this.remaining > 0) return false;
    this.completed = 0;
    this.offered++;
    return true;
  }
}

/** Play totals are separate from reading goals and survive sync through shot events. `saves` are the child's own, as goalkeeper. */
export function soccerTotals(events: PracticeEvent[]): { goals: number; saves: number; shots: number } {
  const shots = events.filter((e) => e.activity === 'soccer');
  return { shots: shots.length, goals: shots.filter((e) => e.meta?.result === 'goal').length,
    saves: shots.filter((e) => e.meta?.result === 'keeper-save').length };
}
