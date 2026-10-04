import type { Profile } from '../profiles/Profile';
import type { PracticeEvent } from './events';

/**
 * Port for on-device storage. Implementations: MemoryStore (tests), IndexedDbStore (browser).
 * Events are written idempotently (same id = same event), so replays and sync pulls are safe.
 */
export interface LocalStore {
  events(profileId: string): Promise<PracticeEvent[]>;
  allEvents(): Promise<PracticeEvent[]>;
  putEvents(events: PracticeEvent[]): Promise<void>;
  profiles(): Promise<Profile[]>;
  putProfiles(profiles: Profile[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryStore implements LocalStore {
  private ev = new Map<string, PracticeEvent>();
  private pr = new Map<string, Profile>();
  private meta = new Map<string, unknown>();

  async events(profileId: string): Promise<PracticeEvent[]> { return [...this.ev.values()].filter((e) => e.profileId === profileId).map((e) => structuredClone(e)); }
  async allEvents(): Promise<PracticeEvent[]> { return [...this.ev.values()].map((e) => structuredClone(e)); }
  async putEvents(events: PracticeEvent[]): Promise<void> { for (const e of events) if (!this.ev.has(e.id)) this.ev.set(e.id, structuredClone(e)); }
  async profiles(): Promise<Profile[]> { return [...this.pr.values()].map((p) => structuredClone(p)); }
  async putProfiles(profiles: Profile[]): Promise<void> { for (const p of profiles) this.pr.set(p.id, structuredClone(p)); }
  async getMeta<T>(key: string): Promise<T | undefined> { return structuredClone(this.meta.get(key)) as T | undefined; }
  async setMeta<T>(key: string, value: T): Promise<void> { this.meta.set(key, structuredClone(value)); }
  async clear(): Promise<void> { this.ev.clear(); this.pr.clear(); this.meta.clear(); }
}
