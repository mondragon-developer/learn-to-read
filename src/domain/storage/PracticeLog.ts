import type { Clock } from '../time/Clock';
import { EVENT_SCHEMA, mergeEvents, newEventId, type PracticeEvent } from './events';
import type { LocalStore } from './LocalStore';
import type { Outbox } from './Outbox';

export type NewEvent = Omit<PracticeEvent, 'v' | 'id' | 'at' | 'day'>;

/**
 * The only way to write practice data. Every event is saved on the device first (practice
 * works offline) and queued in the outbox for SyncService.
 */
export class PracticeLog {
  constructor(
    private readonly local: LocalStore,
    private readonly outbox: Outbox,
    private readonly clock: Clock,
    private readonly makeId: () => string = newEventId,
  ) {}

  async record(input: NewEvent): Promise<PracticeEvent> {
    const e: PracticeEvent = { v: EVENT_SCHEMA, id: this.makeId(), at: this.clock.now(), day: this.clock.today(), ...input };
    await this.local.putEvents([e]);
    await this.outbox.add([e.id]);
    return e;
  }

  async events(profileId: string): Promise<PracticeEvent[]> {
    return mergeEvents(await this.local.events(profileId));
  }

  async pending(): Promise<number> { return (await this.outbox.ids()).length; }
}
