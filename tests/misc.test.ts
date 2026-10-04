import { describe, expect, it } from 'vitest';
import { emptyGrid, scoreTrace, type Grid } from '../src/domain/writing/TraceScorer';
import { streak, trophies, GOALS_PER_BLOCK } from '../src/domain/rewards/Rewards';
import { mergeEvents } from '../src/domain/storage/events';
import { mergeProfiles, DEFAULT_SETTINGS, type Profile } from '../src/domain/profiles/Profile';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { dayNumber, FixedClock } from '../src/domain/time/Clock';
import { ev, SOURCE } from './fixtures';

function line(width: number, height: number, y: number, x0: number, x1: number): Grid {
  const g = emptyGrid(width, height);
  for (let x = x0; x <= x1; x++) g.cells[y * width + x] = true;
  return g;
}

describe('TraceScorer', () => {
  it('passes a trace that follows the model within tolerance', () => {
    expect(scoreTrace(line(40, 20, 10, 5, 35), line(40, 20, 11, 6, 34)).pass).toBe(true);
  });
  it('fails a trace that covers only half the model', () => {
    const r = scoreTrace(line(40, 20, 10, 5, 35), line(40, 20, 10, 5, 18));
    expect(r.coverage).toBeLessThan(0.7);
    expect(r.pass).toBe(false);
  });
  it('fails scribbling everywhere (good coverage, bad precision)', () => {
    const scribble = emptyGrid(40, 20);
    scribble.cells.fill(true);
    const r = scoreTrace(line(40, 20, 10, 5, 35), scribble);
    expect(r.coverage).toBe(1);
    expect(r.pass).toBe(false);
  });
  it('rejects mismatched grid sizes', () => {
    expect(() => scoreTrace(emptyGrid(2, 2), emptyGrid(3, 3))).toThrow();
  });
});

describe('Rewards', () => {
  it('counts goals, blocks and built stadium parts', () => {
    const events = Array.from({ length: GOALS_PER_BLOCK * 6 }, (_, i) => ev('review', `w:x${i}`, 0));
    events.push(ev('review', 'w:miss', 0, 'missed'));
    const t = trophies(events, 0);
    expect(t.goals).toBe(18);
    expect(t.blocks).toBe(6);
    expect(t.built.map((p) => p.id)).toEqual(['grass', 'ball']);
    expect(t.next?.id).toBe('goal-left');
    expect(t.blocksToNext).toBe(4);
  });

  it('streak counts consecutive session days and survives a not-yet-practiced today', () => {
    const sessions = [3, 4, 5].map((d) => ev('session', `sess${d}`, d));
    expect(streak(sessions, 5)).toBe(3);
    expect(streak(sessions, 6)).toBe(3);
    expect(streak(sessions, 7)).toBe(0);
  });
});

describe('event merge', () => {
  it('is a union by id and idempotent', () => {
    const a = [ev('review', 'w:a', 0), ev('review', 'w:b', 0)];
    const b = [a[1]!, ev('review', 'w:c', 1)];
    const once = mergeEvents(a, b);
    expect(once.map((e) => e.itemId)).toEqual(['w:a', 'w:b', 'w:c']);
    expect(mergeEvents(once, b, a)).toEqual(once);
  });
});

describe('profiles merge', () => {
  const p = (id: string, updatedAt: number, name: string): Profile => ({ v: 1, id, firstName: name, color: '#000', number: 7, createdAt: 1, updatedAt, settings: DEFAULT_SETTINGS });
  it('keeps the newest version of each profile', () => {
    expect(mergeProfiles([p('a', 1, 'Old')], [p('a', 2, 'New'), p('b', 1, 'B')]).map((x) => x.firstName)).toEqual(['New', 'B']);
  });
});

describe('ContentLibrary', () => {
  const lib = new ContentLibrary(SOURCE);
  it('interleaves 2 decodable : 1 heart word', () => {
    expect(lib.unitCards(1).map((c) => c.text)).toEqual(['cat', 'map', 'the', 'sat', 'pan', 'a', 'man']);
  });
  it('adds challenge words with syllables, skipping ones a unit already teaches', () => {
    expect(lib.challengeOrder).toEqual(['w:robin', 'w:water']);
    expect(lib.card('w:robin')).toMatchObject({ kind: 'challenge', syllables: ['rob', 'in'] });
    expect(lib.card('w:cat')?.kind).toBe('decodable');
  });
  it('makes ad-hoc cards for story words outside the units', () => {
    expect(lib.storyCard('Robin')).toMatchObject({ id: 'w:robin', unit: 0 });
  });
});

describe('Clock', () => {
  it('uses the local calendar day', () => {
    // 2026-10-05 02:00 UTC is still Oct 4 in Florida (UTC-4, offset +240 minutes)
    const ms = Date.UTC(2026, 9, 5, 2);
    expect(dayNumber(ms, 240)).toBe(dayNumber(Date.UTC(2026, 9, 4, 12), 0));
    const c = new FixedClock(ms, 240);
    c.advanceDays(1);
    expect(c.today()).toBe(dayNumber(Date.UTC(2026, 9, 5, 12), 0));
  });
});

import { wordAtChar, wordStartTimes } from '../src/domain/audio/followTiming';

describe('follow-along timing', () => {
  it('starts every word in order inside the clip, longer words getting more time', () => {
    const t = wordStartTimes(['The', 'elephant', 'sat.'], 3000);
    expect(t).toHaveLength(3);
    expect(t[0]).toBeGreaterThan(0);
    expect(t[1]! - t[0]!).toBeLessThan(t[2]! - t[1]!); // "The" is shorter than "elephant"
    expect(t[2]).toBeLessThan(3000);
  });
  it('maps a speech boundary char index to its word', () => {
    const words = ['The', 'cat', 'sat.'];
    expect(wordAtChar(words, 0)).toBe(0);
    expect(wordAtChar(words, 4)).toBe(1);
    expect(wordAtChar(words, 8)).toBe(2);
  });
});

import { checkTake } from '../src/domain/audio/VoiceRecorder';

describe('checkTake', () => {
  const ok = { seconds: 1.6, peak: 0.4, bytes: 20_000, via: 'engine' as const };
  it('accepts a normal take', () => expect(checkTake(ok)).toBeNull());
  it('flags an empty take (header only, or too short)', () => {
    expect(checkTake({ ...ok, bytes: 300 })).toBe('empty');
    expect(checkTake({ ...ok, seconds: 0.1 })).toBe('empty');
  });
  it('flags a silent take (muted or blocked mic)', () => expect(checkTake({ ...ok, peak: 0.004 })).toBe('silent'));
  it('unknown loudness (played by the <audio> fallback) is not called silent', () => {
    expect(checkTake({ ...ok, peak: -1, seconds: 0, via: 'element' })).toBeNull();
  });
  it('flags a take nothing could play', () => {
    expect(checkTake({ seconds: 0, peak: -1, bytes: 20_000, via: 'none', error: 'decode failed' })).toBe('unplayable');
    expect(checkTake({ seconds: 0, peak: -1, bytes: 100, via: 'none' })).toBe('empty');
  });
});
