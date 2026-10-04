import type { ChallengeWord, DecodableWord, HeartWord, Story, Unit } from './types';

/** Port: where content comes from (bundled JSON today, maybe a CMS later). */
export interface ContentSource {
  units(): Unit[];
  heartWords(): HeartWord[];
  stories(): Story[];
  challengeWords(): ChallengeWord[];
}

/** A practice card: one word the child learns to read. Id is stable across content edits: 'w:cat'. */
export interface Card {
  id: string;
  text: string;
  kind: 'decodable' | 'heart' | 'challenge';
  unit: number;
  graphemes?: string[];
  heartPart?: string;
  /** Challenge words only: ['rob', 'in']. */
  syllables?: string[];
  es?: string;
  reward?: string;
}

export const cardId = (text: string): string => `w:${text.toLowerCase()}`;

/** Read-only index over all content; the planner and screens ask it questions. */
export class ContentLibrary {
  readonly units: Unit[];
  readonly stories: Story[];
  private readonly cards = new Map<string, Card>();
  private readonly heart: HeartWord[];
  /** Challenge card ids in teaching order. */
  readonly challengeOrder: string[] = [];

  constructor(source: ContentSource) {
    this.units = [...source.units()].sort((a, b) => a.order - b.order);
    this.heart = source.heartWords();
    this.stories = [...source.stories()].sort((a, b) => a.unit - b.unit || a.id.localeCompare(b.id));
    for (const u of this.units) {
      for (const w of u.words) this.addDecodable(w, u.order);
      for (const text of u.heartWords) {
        const h = this.heart.find((x) => x.text.toLowerCase() === text.toLowerCase());
        if (h) this.cards.set(cardId(h.text), { id: cardId(h.text), text: h.text, kind: 'heart', unit: h.unit, heartPart: h.heartPart, es: h.es });
      }
    }
    for (const c of source.challengeWords()) {
      const id = cardId(c.text);
      if (this.cards.has(id)) continue; // a unit already teaches it
      this.cards.set(id, { id, text: c.text, kind: 'challenge', unit: 0, syllables: c.syllables, es: c.es, reward: c.reward });
      this.challengeOrder.push(id);
    }
  }

  private addDecodable(w: DecodableWord, unit: number): void {
    const id = cardId(w.text);
    if (this.cards.has(id)) return;
    this.cards.set(id, { id, text: w.text, kind: 'decodable', unit, graphemes: w.graphemes, es: w.es, reward: w.reward });
  }

  heartWords(): HeartWord[] { return this.heart; }
  card(id: string): Card | undefined { return this.cards.get(id); }
  allCards(): Card[] { return [...this.cards.values()]; }
  unit(order: number): Unit | undefined { return this.units.find((u) => u.order === order); }
  lastUnit(): number { return this.units.at(-1)?.order ?? 1; }
  story(id: string): Story | undefined { return this.stories.find((s) => s.id === id); }

  /** Cards of a unit in teaching order: decodable words first, heart words interleaved after. */
  unitCards(order: number): Card[] {
    const u = this.unit(order);
    if (!u) return [];
    const dec = u.words.map((w) => this.cards.get(cardId(w.text))).filter((c): c is Card => !!c);
    const heart = u.heartWords.map((t) => this.cards.get(cardId(t))).filter((c): c is Card => !!c);
    // 2 decodable : 1 heart, so each day's 3 new words mix both kinds.
    const out: Card[] = [];
    while (dec.length || heart.length) {
      out.push(...dec.splice(0, 2));
      const h = heart.shift();
      if (h) out.push(h);
    }
    return out;
  }

  /**
   * Ad-hoc card for a word met in a story (not part of a unit). Misses in Read With Me land here
   * so the word comes back in review.
   */
  storyCard(text: string): Card {
    const id = cardId(text);
    return this.cards.get(id) ?? { id, text: text.toLowerCase(), kind: 'heart', unit: 0 };
  }
}
