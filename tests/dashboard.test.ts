import { describe, expect, it } from 'vitest';
import { dashboard } from '../src/domain/analysis/Dashboard';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { ev, SOURCE } from './fixtures';

const lib = new ContentLibrary(SOURCE);

describe('dashboard', () => {
  it('sums minutes per day and this week', () => {
    const events = [
      ev('session', 's1', 20, 'first-try', { meta: { durationMs: 300_000 } }),
      ev('session', 's2', 20, 'first-try', { meta: { durationMs: 120_000 } }),
      ev('session', 's3', 5, 'first-try', { meta: { durationMs: 600_000 } }),
    ];
    const d = dashboard(events, lib, 20);
    expect(d.minutes).toHaveLength(14);
    expect(d.minutes.at(-1)).toEqual({ day: 20, minutes: 7 });
    expect(d.minutesThisWeek).toBe(7);
    expect(d.sessionsThisWeek).toBe(2);
  });

  it('lists trouble words still in low boxes, with what the mic heard', () => {
    const events = [
      ev('new-word', 'w:cat', 0), ev('review', 'w:cat', 1, 'missed', { meta: { heard: 'cut' } }),
      ev('review', 'w:cat', 1, 'missed', { meta: { heard: 'cot' } }),
      ev('new-word', 'w:map', 0), ev('review', 'w:map', 1, 'missed'),
      ev('review', 'w:map', 1), ev('review', 'w:map', 2), ev('review', 'w:map', 5), // climbed back up to box 4
    ];
    const d = dashboard(events, lib, 6);
    expect(d.troubleWords.map((t) => t.text)).toEqual(['cat']);
    expect(d.troubleWords[0]?.heard).toEqual(['cut', 'cot']);
  });

  it('scores story questions by skill', () => {
    const events = [
      ev('story-question', 's01:q0', 0, 'first-try', { meta: { skill: 'sequence' } }),
      ev('story-question', 's02:q0', 0, 'missed', { meta: { skill: 'compare' } }),
      ev('story-question', 's02:q1', 0, 'first-try', { meta: { skill: 'compare' } }),
    ];
    expect(dashboard(events, lib, 0).storySkills).toEqual([
      { skill: 'sequence', right: 1, total: 1 }, { skill: 'compare', right: 1, total: 2 },
    ]);
  });

  it('first-try rate over reviews', () => {
    const events = [ev('new-word', 'w:cat', 0), ev('review', 'w:cat', 1), ev('review', 'w:cat', 2, 'missed')];
    expect(dashboard(events, lib, 2).firstTryRate).toBe(0.5);
    expect(dashboard([], lib, 2).firstTryRate).toBeNull();
  });
});
