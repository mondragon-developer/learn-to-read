import type { Clock } from '../time/Clock';
import { mergeProfiles, type Profile } from '../profiles/Profile';
import type { LocalStore } from './LocalStore';

const DIRTY = 'profilesDirty';

/** Children's profiles on this device. Edits are stamped and flagged for upload (last write wins). */
export class ProfileRepository {
  constructor(private readonly local: LocalStore, private readonly clock: Clock) {}

  async list(): Promise<Profile[]> { return mergeProfiles(await this.local.profiles(), []); }

  async save(p: Profile): Promise<void> {
    await this.local.putProfiles([{ ...p, updatedAt: this.clock.now() }]);
    await this.markDirty(true);
  }

  /** Merges profiles from elsewhere (server, backup file); newer copies win. */
  async merge(incoming: Profile[]): Promise<void> {
    await this.local.putProfiles(mergeProfiles(await this.local.profiles(), incoming));
  }

  async isDirty(): Promise<boolean> { return (await this.local.getMeta<boolean>(DIRTY)) ?? false; }
  async markDirty(dirty: boolean): Promise<void> { await this.local.setMeta(DIRTY, dirty); }
}
