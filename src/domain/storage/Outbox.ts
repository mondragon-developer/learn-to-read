import type { LocalStore } from './LocalStore';

const KEY = 'outbox';

/**
 * Ids of events saved on this device but not yet confirmed by the server.
 * One instance is shared by PracticeLog, SyncService and BackupService, and every operation runs
 * through a queue: the list is read-modify-written, so two interleaved writers would otherwise
 * drop an id and that event would never upload.
 */
export class Outbox {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly local: LocalStore) {}

  ids(): Promise<string[]> { return this.serial(() => this.read()); }

  add(ids: string[]): Promise<void> {
    return this.serial(async () => { if (ids.length) await this.local.setMeta(KEY, [...(await this.read()), ...ids]); });
  }

  /** Removes only what was sent; events recorded during the upload stay queued. */
  remove(sent: Set<string>): Promise<void> {
    return this.serial(async () => this.local.setMeta(KEY, (await this.read()).filter((id) => !sent.has(id))));
  }

  private async read(): Promise<string[]> { return (await this.local.getMeta<string[]>(KEY)) ?? []; }

  /** Runs operations one at a time, in call order; a failed one doesn't block the next. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
