import type { LocalStore } from './LocalStore';
import type { Outbox } from './Outbox';
import type { ProfileRepository } from './ProfileRepository';
import type { RemoteStore } from './RemoteStore';

const CURSOR = 'cursor';

export interface SyncReport { pushed: number; pulled: number; ok: boolean; error?: string }

/**
 * Moves data between this device and the family's cloud copy: push the outbox, push edited
 * profiles, pull what other devices sent. Events are a union by id, so devices that practiced
 * offline merge cleanly. Concurrent calls share one run.
 */
export class SyncService {
  private running: Promise<SyncReport> | null = null;

  constructor(
    private readonly local: LocalStore,
    private readonly outbox: Outbox,
    private readonly profiles: ProfileRepository,
    private remote: RemoteStore | null = null,
  ) {}

  /** Attach or detach the cloud (after the parent signs in or out). */
  setRemote(remote: RemoteStore | null): void { this.remote = remote; }
  get hasRemote(): boolean { return this.remote !== null; }

  sync(): Promise<SyncReport> {
    if (!this.remote) return Promise.resolve({ pushed: 0, pulled: 0, ok: false, error: 'not signed in' });
    this.running ??= this.run(this.remote).finally(() => { this.running = null; });
    return this.running;
  }

  private async run(remote: RemoteStore): Promise<SyncReport> {
    let pushed = 0;
    let pulled = 0;
    try {
      const queued = new Set(await this.outbox.ids());
      if (queued.size) {
        const toPush = (await this.local.allEvents()).filter((e) => queued.has(e.id));
        await remote.pushEvents(toPush);
        pushed = toPush.length;
        await this.outbox.remove(queued);
      }
      if (await this.profiles.isDirty()) {
        await remote.pushProfiles(await this.local.profiles());
        await this.profiles.markDirty(false);
      }
      const cursor = (await this.local.getMeta<string | null>(CURSOR)) ?? null;
      const { events, cursor: next } = await remote.pullEvents(cursor);
      await this.local.putEvents(events);
      pulled = events.length;
      await this.local.setMeta(CURSOR, next);
      await this.profiles.merge(await remote.pullProfiles());
      return { pushed, pulled, ok: true };
    } catch (err) {
      return { pushed, pulled, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
