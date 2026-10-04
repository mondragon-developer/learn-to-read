import { describe, expect, it } from 'vitest';
import { dueCards, INTERVAL_DAYS, MASTERED_BOX, rebuildDeck } from '../src/domain/srs/Leitner';
import { ev } from './fixtures';

describe('Leitner', () => {
  it('a new word enters box 1, due tomorrow', () => {
    const deck = rebuildDeck([ev('new-word', 'w:cat', 10)]);
    expect(deck.get('w:cat')).toMatchObject({ box: 1, due: 11, introducedDay: 10 });
  });

  it('first-try reads on due days climb the boxes with growing intervals', () => {
    const events = [ev('new-word', 'w:cat', 0)];
    let day = 1;
    for (let box = 2; box <= MASTERED_BOX; box++) {
      events.push(ev('review', 'w:cat', day));
      const s = rebuildDeck(events).get('w:cat')!;
      expect(s.box).toBe(box);
      expect(s.due).toBe(day + INTERVAL_DAYS[box]!);
      day = s.due;
    }
  });

  it('extra reads before the due day do not promote', () => {
    const deck = rebuildDeck([ev('new-word', 'w:cat', 0), ev('review', 'w:cat', 1), ev('review', 'w:cat', 1)]);
    expect(deck.get('w:cat')!.box).toBe(2);
  });

  it('a miss sends the card back to box 1, due today', () => {
    const deck = rebuildDeck([ev('new-word', 'w:cat', 0), ev('review', 'w:cat', 1), ev('review', 'w:cat', 2), ev('review', 'w:cat', 5, 'missed')]);
    expect(deck.get('w:cat')).toMatchObject({ box: 1, due: 5, misses: 1 });
  });

  it('after-retry keeps the box and brings it back tomorrow', () => {
    const deck = rebuildDeck([ev('new-word', 'w:cat', 0), ev('review', 'w:cat', 1), ev('review', 'w:cat', 2, 'after-retry')]);
    expect(deck.get('w:cat')).toMatchObject({ box: 2, due: 3 });
  });

  it('a mastered word that slips drops to box 3, not 1', () => {
    const events = [ev('new-word', 'w:cat', 0)];
    for (const d of [1, 2, 5, 12, 26]) events.push(ev('review', 'w:cat', d));
    expect(rebuildDeck(events).get('w:cat')!.box).toBe(MASTERED_BOX);
    events.push(ev('review', 'w:cat', 56, 'missed'));
    expect(rebuildDeck(events).get('w:cat')!.box).toBe(3);
  });

  it('a story miss adds an unknown word to the deck; a story hit never promotes', () => {
    const deck = rebuildDeck([ev('story-read', 'w:robin', 3, 'missed'), ev('new-word', 'w:cat', 3), ev('story-read', 'w:cat', 4)]);
    expect(deck.get('w:robin')).toMatchObject({ box: 1, due: 4 });
    expect(deck.get('w:cat')!.box).toBe(1);
  });

  it('rebuild is order-independent (events from two devices arrive in any order)', () => {
    const events = [ev('new-word', 'w:cat', 0), ev('review', 'w:cat', 1), ev('review', 'w:cat', 2, 'missed')];
    expect(rebuildDeck([...events].reverse())).toEqual(rebuildDeck(events));
  });

  it('dueCards lists weakest first and skips future cards', () => {
    const deck = rebuildDeck([
      ev('new-word', 'w:cat', 0), ev('new-word', 'w:map', 0), ev('new-word', 'w:sat', 5),
      ev('review', 'w:cat', 1),
    ]);
    expect(dueCards(deck, 2).map((c) => c.id)).toEqual(['w:map', 'w:cat']);
  });
});
