import type { Profile } from '../profiles/Profile';
import type { PracticeEvent } from './events';

/**
 * Port for the family's cloud copy (Supabase in production). Row Level Security on the server
 * guarantees a family only ever sees its own rows; this interface never takes a family id.
 */
export interface RemoteStore {
  /** Upsert, ignoring ids the server already has. */
  pushEvents(events: PracticeEvent[]): Promise<void>;
  /** Events the server received after `cursor` (opaque), plus the new cursor. */
  pullEvents(cursor: string | null): Promise<{ events: PracticeEvent[]; cursor: string | null }>;
  pushProfiles(profiles: Profile[]): Promise<void>;
  pullProfiles(): Promise<Profile[]>;
}

/** In-memory server used by tests and by "two devices" simulations. */
export class FakeRemote implements RemoteStore {
  private log: PracticeEvent[] = [];
  private profilesById = new Map<string, Profile>();
  online = true;

  async pushEvents(events: PracticeEvent[]): Promise<void> {
    this.assertOnline();
    const have = new Set(this.log.map((e) => e.id));
    for (const e of events) if (!have.has(e.id)) { this.log.push(structuredClone(e)); have.add(e.id); }
  }

  async pullEvents(cursor: string | null): Promise<{ events: PracticeEvent[]; cursor: string | null }> {
    this.assertOnline();
    const from = cursor ? Number(cursor) : 0;
    return { events: this.log.slice(from).map((e) => structuredClone(e)), cursor: String(this.log.length) };
  }

  async pushProfiles(profiles: Profile[]): Promise<void> {
    this.assertOnline();
    for (const p of profiles) {
      const cur = this.profilesById.get(p.id);
      if (!cur || p.updatedAt > cur.updatedAt) this.profilesById.set(p.id, structuredClone(p));
    }
  }

  async pullProfiles(): Promise<Profile[]> { this.assertOnline(); return [...this.profilesById.values()].map((p) => structuredClone(p)); }

  get size(): number { return this.log.length; }

  private assertOnline(): void { if (!this.online) throw new Error('offline'); }
}
