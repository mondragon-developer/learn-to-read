import { describe, expect, it } from 'vitest';
import { aimedShot, ballAt, isSaved, keeperAt, keeperMove, resolveShot, SoccerBreaks, dragShot } from '../src/domain/rewards/Soccer';
import { toProfile } from '../src/domain/profiles/Profile';

describe('soccer controls and fair goalkeeper', () => {
  it('ignores taps and backwards swipes, but accepts a small upward swipe', () => {
    expect(dragShot(0, 0, 100)).toBeNull();
    expect(dragShot(20, 40, 100)).toBeNull();
    expect(dragShot(8, -30, 400)).not.toBeNull();
  });
  it('aims at the drag endpoint and charges with hold time, independent of distance', () => {
    const quick = dragShot(80, -250, 100)!;
    const held = dragShot(80, -250, 1400)!;
    expect(held).toMatchObject({ x: 400, y: 140, range: 1 });
    expect(held.power).toBeGreaterThan(quick.power);
    expect(quick.range).toBeLessThan(1);
    expect(dragShot(-100, -280, 1400)!.power).toBe(held.power);
    expect(dragShot(80, -250, 90000)!.power).toBe(held.power);
    expect(held.flightMs).toBeLessThan(quick.flightMs);
  });
  it('reacts after a delay and moves continuously', () => {
    const shot = aimedShot(470, 1);
    const move = keeperMove(shot, 230, 0, () => 0);
    expect(keeperAt(move, 100)).toEqual({ x: 230, y: 174 });
    expect(keeperAt(move, 500).x).toBeGreaterThan(230);
    expect(keeperAt(move, 500).x).toBeLessThan(470);
  });
  it('saves only where the goalkeeper actually reaches the ball', () => {
    const shot = aimedShot(330, .75);
    expect(isSaved(shot, keeperMove(shot, 320, 0, () => 0))).toBe(true);
    const wrong = keeperMove(shot, 320, 0, () => 0.99);
    expect(wrong.x).toBeLessThan(320);
    expect(isSaved(shot, wrong)).toBe(false);
  });
  it('saves approximately 30% across goal locations, keeper positions and rounds', () => {
    for (const round of [0, 1, 2]) {
      for (const startX of [265, 320, 375]) {
        for (const x of [190, 260, 320, 400, 450]) {
          let saves = 0;
          for (let i = 0; i < 100; i++) {
            const shot = aimedShot(x, .8);
            if (isSaved(shot, keeperMove(shot, startX, round, () => i / 100))) saves++;
          }
          expect(saves).toBe(30);
        }
      }
    }
  });
  it('saves a ball that reaches the raised glove during a dive', () => {
    for (const [x, startX] of [[460, 265], [180, 375]]) {
      const shot = aimedShot(x!, 1);
      const move = keeperMove(shot, startX!, 0, () => 0);
      expect(resolveShot(shot, move, 0).outcome).toBe('saved');
    }
  });
  it.each([
    ['short', 320, .25, 0],
    ['wide', 590, .8, 0],
    ['wide', 320, 1.6, 0],
    ['post', 145, .8, 0],
    ['bar', 320, .35 + 120 / 135, 0],
    ['wall', 300, .6, 1],
    ['goal', 460, .85, 0],
  ] as const)('resolves %s from the actual trajectory', (outcome, x, power, round) => {
    const shot = aimedShot(x, power);
    const result = resolveShot(shot, keeperMove(shot, 230, round, () => .99), round);
    expect(result.outcome).toBe(outcome);
    expect({ x: result.x, y: result.y }).toEqual(ballAt(shot, result.progress));
  });
  it('clears the wall with enough lift or by aiming around it', () => {
    for (const shot of [aimedShot(300, 1.05), aimedShot(460, .65)]) {
      expect(resolveShot(shot, keeperMove(shot, 320, 1, () => 0), 1).outcome).not.toBe('wall');
    }
  });
  it('restores kit choices and rejects untrusted colors when importing a profile', () => {
    const p = toProfile({ id: 'p1', firstName: 'Sam', color: '#2D5BD0', number: 77, settings: { shortsColor: '#D2462E', cleatsColor: '#f68b36' } });
    expect(p).toMatchObject({ number: 77, color: '#2D5BD0', settings: { shortsColor: '#D2462E', cleatsColor: '#f68b36' } });
    expect(toProfile({ id: 'p1', firstName: 'Sam', settings: { shortsColor: 'url(bad)', cleatsColor: 'invalid' } })?.settings)
      .toMatchObject({ shortsColor: '#142e46', cleatsColor: '#f8fafc' });
  });
});

describe('practice break pacing', () => {
  it('counts participation, not skipped activities, and caps a short session at one break', () => {
    const breaks = new SoccerBreaks(6, 5, true);
    expect(breaks.finishStep(false, true)).toBe(false);
    expect(breaks.remaining).toBe(3);
    expect(breaks.finishStep(true, true)).toBe(false);
    expect(breaks.finishStep(true, true)).toBe(false);
    expect(breaks.finishStep(true, true)).toBe(true);
    expect(breaks.available).toBe(false);
    for (let i = 0; i < 10; i++) expect(breaks.finishStep(true, true)).toBe(false);
  });
  it('never interrupts a final activity or inserts a break into a tiny or disabled session', () => {
    for (const breaks of [new SoccerBreaks(3, 5, true), new SoccerBreaks(12, 15, false)]) {
      for (let i = 0; i < 12; i++) expect(breaks.finishStep(true, true)).toBe(false);
    }
    const breaks = new SoccerBreaks(4, 5, true);
    breaks.finishStep(true, true);
    breaks.finishStep(true, true);
    expect(breaks.finishStep(true, false)).toBe(false);
  });
  it('spaces at most two breaks through longer sessions', () => {
    const breaks = new SoccerBreaks(13, 15, true);
    const offered = Array.from({ length: 13 }, (_, i) => breaks.finishStep(true, i < 12));
    expect(offered.flatMap((yes, i) => yes ? [i + 1] : [])).toEqual([4, 8]);
  });
});
