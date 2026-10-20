/** Soccer is a play break. Its results never become reading assessments or rewards. */
export const BALL = { x: 320, y: 390 };
export const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
export interface Shot { x: number; y: number; flightMs: number; power: number; range: number; arc: number }

export function aimedShot(x: number, power: number): Shot {
  power = clamp(power, 0.12, 1.6);
  return { x: clamp(x, 30, 610), y: 200 - (power - 0.35) * 135,
    power, range: Math.min(1, power / 0.5), arc: 20 + power * 65,
    flightMs: 1450 - power * 380 };
}

/** Coordinates use the field's 640 × 440 viewBox, independent of screen size. */
export function swipeShot(dx: number, dy: number, elapsedMs: number): Shot | null {
  if (dy > -12 || Math.hypot(dx, dy) < 18) return null;
  const distance = Math.hypot(dx, dy);
  const speed = distance / Math.max(120, elapsedMs);
  const power = distance / 240 * 0.65 + speed / 1.5 * 0.35;
  return aimedShot(BALL.x + dx / Math.max(80, -dy) * 250, power);
}

export interface KeeperMove { startX: number; x: number; y: number; delayMs: number; moveMs: number }
export function keeperMove(shot: Shot, startX: number, round: number, random = Math.random): KeeperMove {
  const tracksBall = random() < 0.9;
  const desired = tracksBall ? shot.x : (shot.x < 320 ? 445 : 195);
  const reach = 145 + round * 12;
  return {
    startX, x: clamp(desired, startX - reach, startX + reach),
    y: tracksBall ? clamp(shot.y + 12, 115, 174) : 165,
    delayMs: 190 - round * 25 + random() * 90,
    moveMs: 600,
  };
}

export function keeperAt(move: KeeperMove, elapsedMs: number): { x: number; y: number } {
  const t = clamp((elapsedMs - move.delayMs) / move.moveMs, 0, 1);
  return { x: move.startX + (move.x - move.startX) * t, y: 174 + (move.y - 174) * t };
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
  return { x: BALL.x + (shot.x - BALL.x) * t,
    y: BALL.y + (shot.y - BALL.y) * t - shot.arc * Math.sin(Math.PI * t) };
}

export type ShotOutcome = 'goal' | 'saved' | 'wide' | 'short' | 'post' | 'bar' | 'wall';
export interface ShotResult { outcome: ShotOutcome; progress: number; x: number; y: number }
export const wallCenters = (round: number): number[] => round === 0 ? [] : [280, 324].map((x) => x + (round === 2 ? 65 : 0));

/** Collision order follows the flight: wall first, then range, frame, keeper and net. */
export function resolveShot(shot: Shot, move: KeeperMove, round: number): ShotResult {
  const result = (outcome: ShotOutcome, progress: number): ShotResult => ({ outcome, progress, ...ballAt(shot, progress) });
  const wallProgress = (BALL.y - 263) / (BALL.y - 200);
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
  return result(isSaved(shot, move) ? 'saved' : 'goal', 1);
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
