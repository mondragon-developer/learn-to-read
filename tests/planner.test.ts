import { describe, expect, it } from 'vitest';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { rebuildDeck } from '../src/domain/srs/Leitner';
import { SessionPlanner, STEP_SECONDS, type SessionSettings } from '../src/domain/session/SessionPlanner';
import type { PracticeEvent } from '../src/domain/storage/events';
import { ev, SOURCE } from './fixtures';

const lib = new ContentLibrary(SOURCE);
const planner = new SessionPlanner();
const settings = (over: Partial<SessionSettings> = {}): SessionSettings => ({ minutes: 5, writing: 'off', startUnit: 1, ...over });
const plan = (events: PracticeEvent[], today: number, over: Partial<SessionSettings> = {}) =>
  planner.plan({ library: lib, deck: rebuildDeck(events), events, today, settings: settings(over) });

describe('SessionPlanner', () => {
  it('first day: warm-up, 3 new words (2 decodable + 1 heart), one sentence', () => {
    const p = plan([], 0);
    expect(p.unit).toBe(1);
    expect(p.steps.map((s) => s.kind)).toEqual(['warmup', 'new-word', 'new-word', 'new-word', 'sentence']);
    expect(p.steps.filter((s) => s.kind === 'new-word').map((s) => (s as { cardId: string }).cardId)).toEqual(['w:cat', 'w:map', 'w:the']);
  });

  it('5-minute core stays within budget', () => {
    const events = ['w:cat', 'w:map', 'w:the', 'w:sat', 'w:pan', 'w:a'].map((id) => ev('new-word', id, 0));
    const p = plan(events, 1);
    const core = p.steps.reduce((s, x) => s + STEP_SECONDS[x.kind], 0);
    expect(core).toBeLessThanOrEqual(300 + STEP_SECONDS.review); // review floor of 2 can nudge it
    expect(p.steps.filter((s) => s.kind === 'review').length).toBeGreaterThan(0);
  });

  it('reviews come before new words', () => {
    const events = [ev('new-word', 'w:cat', 0)];
    const kinds = plan(events, 1).steps.map((s) => s.kind);
    expect(kinds.indexOf('review')).toBeLessThan(kinds.indexOf('new-word'));
  });

  it('does not introduce more than 3 new words in one day across sessions', () => {
    const events = ['w:cat', 'w:map', 'w:the'].map((id) => ev('new-word', id, 0));
    expect(plan(events, 0).steps.some((s) => s.kind === 'new-word')).toBe(false);
  });

  it('heavy review load cuts new words', () => {
    // 21 due cards -> no new words
    const ids = Array.from({ length: 21 }, (_, i) => `w:x${i}`);
    const events = ids.map((id) => ev('new-word', id, 0));
    expect(plan(events, 5).steps.some((s) => s.kind === 'new-word')).toBe(false);
  });

  it('does not repeat a card already reviewed today', () => {
    const events = [ev('new-word', 'w:cat', 0), ev('review', 'w:cat', 1, 'missed')];
    const p = plan(events, 1);
    expect(p.steps.some((s) => s.kind === 'review' && s.cardId === 'w:cat')).toBe(false);
  });

  it('moves to the next unit only when the current one is fully introduced', () => {
    const unit1 = lib.unitCards(1).map((c) => c.id);
    expect(planner.currentUnit(lib, rebuildDeck(unit1.slice(0, -1).map((id) => ev('new-word', id, 0))), 1)).toBe(1);
    expect(planner.currentUnit(lib, rebuildDeck(unit1.map((id) => ev('new-word', id, 0))), 1)).toBe(2);
  });

  it('never pulls new words from the next unit to fill the day', () => {
    const unit1 = lib.unitCards(1).map((c) => c.id);
    const events = unit1.slice(0, -1).map((id) => ev('new-word', id, 0));
    const news = plan(events, 1).steps.filter((s) => s.kind === 'new-word');
    expect(news).toHaveLength(1);
  });

  it('placement skips earlier units', () => {
    expect(plan([], 0, { startUnit: 2 }).unit).toBe(2);
  });

  it('adds a write step for the first new word when writing is on', () => {
    const p = plan([], 0, { writing: 'trace' });
    expect(p.steps).toContainEqual({ kind: 'write', cardId: 'w:cat', mode: 'trace' });
  });

  it('10 minutes adds one challenge word a day after the unit words; 5 minutes does not', () => {
    const news = (p: ReturnType<typeof plan>) => p.steps.filter((s) => s.kind === 'new-word').map((s) => (s as { cardId: string }).cardId);
    expect(news(plan([], 0, { minutes: 10 }))).toEqual(['w:cat', 'w:map', 'w:the', 'w:robin']);
    expect(news(plan([], 0, { minutes: 5 }))).not.toContain('w:robin');
    expect(news(plan([], 0, { minutes: 10, challenge: false }))).not.toContain('w:robin');
    const afterRobin = [ev('new-word', 'w:robin', 0)];
    expect(news(plan(afterRobin, 0, { minutes: 10 }))).not.toContain('w:water'); // one per day
    expect(news(plan(afterRobin, 1, { minutes: 10 }))).toContain('w:water');
    expect(news(plan(afterRobin, 0, { minutes: 10 }))).toHaveLength(3); // challenge doesn't eat a unit slot
  });

  it('10 minutes adds a story; 15 adds games', () => {
    expect(plan([], 0, { minutes: 10 }).steps.some((s) => s.kind === 'story')).toBe(true);
    const p15 = plan([], 0, { minutes: 15 }).steps;
    expect(p15.filter((s) => s.kind === 'game')).toHaveLength(2);
  });

  it('stories: unread first, alternating tiers, only up to the current unit', () => {
    expect(planner.pickStory(lib, [], 1)?.id).toBe('s01');
    const afterDecodable = [ev('story-question', 's01:q0', 0)];
    expect(planner.pickStory(lib, afterDecodable, 1)?.id).toBe('s02');
    expect(planner.pickStory(lib, afterDecodable, 1)?.id).not.toBe('s03'); // unit 2 story not offered yet
  });

  it('stories: once all are read, redo the weakest, favoring compare/time-words', () => {
    const events = [
      ev('story-question', 's01:q0', 0), ev('story-question', 's01:q1', 0, 'missed'),
      ev('story-question', 's02:q0', 1), ev('story-question', 's02:q1', 1, 'missed'),
    ];
    expect(planner.pickStory(lib, events, 1)?.id).toBe('s02'); // same accuracy, compare gets the nudge
  });

  it('extra time reviews young words and ends with a game', () => {
    const events = [ev('new-word', 'w:cat', 0), ev('new-word', 'w:map', 0)];
    const p = planner.planExtra({ library: lib, deck: rebuildDeck(events), events, today: 0, settings: settings() });
    expect(p.steps.map((s) => s.kind)).toEqual(['review', 'review', 'game']);
  });
});

import { decodeChoice, encodeChoice } from '../src/domain/practice/Topics';

describe('SessionPlanner.planTopic', () => {
  const topicPlan = (events: PracticeEvent[], today: number, choice: string, over: Partial<SessionSettings> = {}) =>
    planner.planTopic({ library: lib, deck: rebuildDeck(events), events, today, settings: settings(over) }, decodeChoice(choice)!);

  it('starts with due reviews, then the chosen topic', () => {
    const events = [ev('new-word', 'w:cat', 0), ev('new-word', 'w:map', 0)];
    const p = topicPlan(events, 1, 'segment');
    expect(p.steps.map((s) => s.kind)).toEqual(['review', 'review', 'warmup']);
    expect(p.steps[2]).toEqual({ kind: 'warmup', game: 'segment', unit: 1, rounds: 8 }); // one longer game, not 3 warm-ups
  });

  it('review first can be turned off', () => {
    const events = [ev('new-word', 'w:cat', 0)];
    expect(topicPlan(events, 1, 'segment', { topicReview: false }).steps.every((s) => s.kind === 'warmup')).toBe(true);
  });

  it('a phonics unit ahead of his level is allowed: sound it out, its new words, a sentence', () => {
    const p = topicPlan([], 0, 'phonics:2');
    expect(p.steps[0]).toEqual({ kind: 'warmup', game: 'sound-it-out', unit: 2 });
    expect(p.steps.filter((s) => s.kind === 'new-word').map((s) => (s as { cardId: string }).cardId)).toEqual(['w:sit', 'w:dig', 'w:pig']);
    expect(p.steps).toContainEqual({ kind: 'sentence', unit: 2, index: 0 });
  });

  it('story topic picks a story with that skill', () => {
    const p = topicPlan([], 0, 'story:compare');
    expect(p.steps).toEqual([{ kind: 'story', storyId: 's02' }]);
  });

  it('heart words: new heart words up to his unit, never decodable ones', () => {
    const ids = topicPlan([], 0, 'heart').steps.map((s) => (s as { cardId: string }).cardId);
    expect(ids).toEqual(['w:the', 'w:a']);
  });

  it('choices round-trip and bad ones are rejected', () => {
    expect(encodeChoice({ topic: 'phonics', unit: 5 })).toBe('phonics:5');
    expect(decodeChoice('story:moral')).toEqual({ topic: 'story', skill: 'moral' });
    expect(decodeChoice('story:dance')).toBeNull();
    expect(decodeChoice('phonics:x')).toBeNull();
    expect(decodeChoice('nope')).toBeNull();
  });
});

describe('homework week', () => {
  it('automatic sessions prefer stories with the homework skill until the week ends', () => {
    const homework = { skill: 'compare' as const, until: 6 };
    expect(plan([], 0, { minutes: 10, homework }).steps).toContainEqual({ kind: 'story', storyId: 's02' });
    expect(plan([], 7, { minutes: 10, homework }).steps).toContainEqual({ kind: 'story', storyId: 's01' }); // week over
  });
});
