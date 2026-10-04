import type { Clock } from '../time/Clock';
import { toProfile, type Profile } from '../profiles/Profile';
import { isPracticeEvent } from './events';
import type { LocalStore } from './LocalStore';
import type { Outbox } from './Outbox';
import type { ProfileRepository } from './ProfileRepository';

const APP = 'goal-reader';

/** Layer 2: a JSON file the parent can save and restore - works with no account at all. */
export class BackupService {
  constructor(
    private readonly local: LocalStore,
    private readonly outbox: Outbox,
    private readonly profiles: ProfileRepository,
    private readonly clock: Clock,
  ) {}

  async exportJson(): Promise<string> {
    return JSON.stringify({
      app: APP, exportedAt: new Date(this.clock.now()).toISOString(),
      profiles: await this.local.profiles(), events: await this.local.allEvents(),
    }, null, 2);
  }

  /**
   * Import merges as a union; it never overwrites. Imported events are queued for upload.
   * Anything malformed is skipped (one bad record must not break the deck or the dashboard).
   */
  async importJson(json: string): Promise<{ events: number; profiles: number }> {
    const data = JSON.parse(json) as { app?: string; profiles?: unknown; events?: unknown };
    if (data.app !== APP) throw new Error('Not a Goal Reader backup');
    const known = new Set((await this.local.allEvents()).map((e) => e.id));
    const events = Array.isArray(data.events) ? data.events : [];
    const fresh = events.filter(isPracticeEvent).filter((e) => !known.has(e.id));
    await this.local.putEvents(fresh);
    await this.outbox.add(fresh.map((e) => e.id));
    const profiles = (Array.isArray(data.profiles) ? data.profiles : []).map(toProfile).filter((p): p is Profile => p !== null);
    await this.profiles.merge(profiles);
    if (profiles.length) await this.profiles.markDirty(true);
    return { events: fresh.length, profiles: profiles.length };
  }
}
