import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, GOAL, ball3, chooseKeeper3, keeper3, keeperTouches3, kick3, resolve3, target3, targetHit3, wall3 } from '../src/domain/rewards/Soccer3D';

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
});
