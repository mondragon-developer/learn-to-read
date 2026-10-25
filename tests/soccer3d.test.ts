import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, GOAL, KEEPER_LIMITS, STRIKER_POWER, ball3, childDive3, chooseKeeper3, diveTo3, keeper3, keeperGlove, keeperTouches3, kick3, resolve3, standKeeper3, strikerAim3, target3, targetHit3, wall3 } from '../src/domain/rewards/Soccer3D';

const origin = { x: 0, y: BALL_RADIUS, z: 12 };
const miss = (shot: ReturnType<typeof kick3>) => chooseKeeper3(shot, 0, () => .99);
describe('world-space soccer', () => {
  it('starts at the chosen ball position and reaches the chosen goal-plane point', () => {
    const start = { x: -3, y: BALL_RADIUS, z: 9 }, aim = { x: 2.4, y: 1.8 }, shot = kick3(start, aim, .9);
    expect(ball3(shot, 0)).toEqual(start);
    expect(ball3(shot, 1).x).toBeCloseTo(aim.x);
    expect(ball3(shot, 1).y).toBeCloseTo(aim.y);
    expect(ball3(shot, 1).z).toBe(0);
    start.x = 9; expect(shot.origin.x).toBe(-3);
    expect(ball3(shot, .5).y).toBeGreaterThan(aim.y / 2);
  });
  it('weak shots land on the grass before the goal and nearer shots need less power', () => {
    const short = kick3(origin, { x: 2, y: 2 }, .3);
    expect(resolve3(short, miss(short), 0, 'penalties').outcome).toBe('short');
    expect(ball3(short, 1).y).toBeCloseTo(BALL_RADIUS);
    expect(ball3(short, 1).z).toBeGreaterThan(0);
    expect(kick3({ ...origin, z: 9 }, { x: 2, y: 1 }, .48).range).toBe(1);
    expect(kick3({ ...origin, z: 14 }, { x: 2, y: 1 }, .48).range).toBeLessThan(1);
  });
  it.each([
    ['goal', 2.5, 1.2], ['post', GOAL.halfWidth, 1.2], ['bar', 0, GOAL.height], ['wide', 5, 1.2], ['wide', 0, 3.8],
  ] as const)('resolves %s against the rendered goal dimensions', (outcome, x, y) => {
    const shot = kick3(origin, { x, y }, .9);
    expect(resolve3(shot, miss(shot), 0, 'penalties').outcome).toBe(outcome);
  });
  it('the wall only exists in later free kicks and can be cleared or avoided', () => {
    const low = kick3(origin, { x: 0, y: .3 }, .8);
    expect(wall3(0, 'free-kicks')).toHaveLength(0);
    expect(wall3(1, 'penalties')).toHaveLength(0);
    expect(resolve3(low, miss(low), 1, 'free-kicks').outcome).toBe('wall');
    const corner = kick3(origin, { x: 3, y: 1.8 }, .9);
    expect(resolve3(corner, miss(corner), 1, 'free-kicks').outcome).toBe('goal');
  });
  it('saves use the same moving body and glove pose as the keeper mesh', () => {
    for (const x of [-2.5, 2.5]) {
      const shot = kick3(origin, { x, y: 1.8 }, .9), move = chooseKeeper3(shot, 0, () => 0);
      const impact = resolve3(shot, move, 0, 'penalties');
      expect(impact.outcome).toBe('saved');
      expect(keeperTouches3(impact.point, keeper3(move, shot.flightMs * impact.t))).toBe(true);
      expect(resolve3(shot, miss(shot), 0, 'penalties').outcome).toBe('goal');
    }
  });
  it('targets have no keeper and a goal away from the ring is not a target hit', () => {
    const shot = kick3(origin, target3(0), .9);
    expect(resolve3(shot, chooseKeeper3(shot, 0, () => 0), 0, 'targets').outcome).toBe('goal');
    expect(targetHit3(shot, 0)).toBe(true);
    expect(targetHit3(kick3(origin, { x: 0, y: .8 }, .9), 0)).toBe(false);
  });
  it('the keeper raises his gloves above his head and never flies higher than a real jump', () => {
    expect(keeperGlove(1, 1).y).toBeGreaterThan(1.9);
    expect(keeperGlove(1, 0).y).toBeLessThan(1.1);
    for (const x of [-3.4, -2, -.8, .8, 2, 3.4]) for (const y of [.3, 1.2, 2.3]) {
      const move = diveTo3({ x, y }, 0, 0, 420);
      for (let ms = 0; ms <= 2000; ms += 40) expect(keeper3(move, ms).y).toBeLessThanOrEqual(KEEPER_LIMITS.jump + .1);
      expect(Math.abs(move.endX)).toBeLessThanOrEqual(KEEPER_LIMITS.step);
    }
  });
  it('after the dive the keeper comes back down to the grass', () => {
    const long = diveTo3({ x: 3.2, y: .4 }, 0, 0, 420), high = diveTo3({ x: .6, y: 2.3 }, 0, 0, 420);
    expect(keeper3(long, 420).y).toBeGreaterThan(.25);
    expect(keeper3(long, 3000)).toMatchObject({ y: .2 });
    expect(Math.abs(keeper3(long, 3000).angle)).toBeCloseTo(1.45);
    expect(keeper3(high, 3000)).toMatchObject({ y: 0, angle: 0 });
  });
  it('a tracking keeper reaches the reachable goal, not the top corner, and blocks a ball at him standing', () => {
    expect(diveTo3({ x: .1, y: 1.1 }, 0, 0)).toMatchObject({ endX: 0, endY: 0, angle: 0 });
    for (let x = 0; x <= 3.3; x += .3) for (const y of [.4, 1.2, 2.1]) {
      const shot = kick3(origin, { x, y }, .9);
      expect(resolve3(shot, chooseKeeper3(shot, 0, () => 0), 0, 'penalties').outcome).toBe('saved');
    }
    // Up under the crossbar in the far corner is beyond any real stretch.
    const corner = kick3(origin, { x: 3.3, y: 2.18 }, .9), move = chooseKeeper3(corner, 0, () => 0);
    expect(resolve3(corner, move, 0, 'penalties').outcome).toBe('goal');
    expect(move.endY).toBeLessThanOrEqual(KEEPER_LIMITS.jump);
  });
  it('keeper mode: tapping where the ball goes saves it; the wrong side or a late tap concedes', () => {
    for (const aim of [{ x: -2.6, y: .4 }, { x: 2.2, y: 1.7 }, { x: 1, y: 1 }]) {
      const shot = kick3(origin, aim, STRIKER_POWER);
      expect(resolve3(shot, childDive3(shot, { x: aim.x + .6, y: aim.y - .4 }, 0, 0), 0, 'keeper').outcome).toBe('saved');
      expect(resolve3(shot, childDive3(shot, { x: -aim.x * 1.5, y: 1 }, 0, 0), 0, 'keeper').outcome).toBe('goal');
      expect(resolve3(shot, childDive3(shot, aim, 0, shot.flightMs), 0, 'keeper').outcome).toBe('goal');
    }
    const middle = kick3(origin, { x: .2, y: 1 }, STRIKER_POWER);
    expect(resolve3(middle, standKeeper3(middle, 0), 0, 'keeper').outcome).toBe('saved');
  });
  it('the computer striker mostly hits the target', () => {
    let seed = 1; const random = (): number => (seed = seed * 16807 % 2147483647) / 2147483647;
    const aims = Array.from({ length: 400 }, () => strikerAim3(random));
    const onTarget = aims.filter((a) => Math.abs(a.x) < GOAL.halfWidth && a.y < GOAL.height).length;
    expect(onTarget / aims.length).toBeGreaterThan(.8);
    expect(onTarget).toBeLessThan(aims.length);
  });
});
