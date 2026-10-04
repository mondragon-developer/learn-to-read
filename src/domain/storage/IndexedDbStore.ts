import type { Profile } from '../profiles/Profile';
import type { PracticeEvent } from './events';
import type { LocalStore } from './LocalStore';

const DB_NAME = 'goal-reader';
const DB_VERSION = 1;

/** Layer 1: IndexedDB. Events keyed by id with a profileId index; profiles; a small meta store. */
export class IndexedDbStore implements LocalStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDB: IDBFactory = globalThis.indexedDB) {}

  /** Asks the browser not to evict our data under storage pressure (Safari evicts after 7 idle days otherwise). */
  async requestPersistence(): Promise<boolean> {
    try { return (await globalThis.navigator?.storage?.persist?.()) ?? false; } catch { return false; }
  }

  async events(profileId: string): Promise<PracticeEvent[]> {
    return this.read<PracticeEvent[]>('events', (s) => s.index('profileId').getAll(profileId));
  }

  async allEvents(): Promise<PracticeEvent[]> { return this.read<PracticeEvent[]>('events', (s) => s.getAll()); }

  async putEvents(events: PracticeEvent[]): Promise<void> {
    if (!events.length) return;
    // add() (not put) keeps the first copy of an id; ConstraintError on duplicates is expected and swallowed.
    await this.write('events', (s) => { for (const e of events) s.add(e).onerror = (ev) => { ev.preventDefault(); ev.stopPropagation(); }; });
  }

  async profiles(): Promise<Profile[]> { return this.read<Profile[]>('profiles', (s) => s.getAll()); }

  async putProfiles(profiles: Profile[]): Promise<void> {
    await this.write('profiles', (s) => { for (const p of profiles) s.put(p); });
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return this.read<T | undefined>('meta', (s) => s.get(key));
  }

  async setMeta<T>(key: string, value: T): Promise<void> {
    await this.write('meta', (s) => { s.put(value, key); });
  }

  async clear(): Promise<void> {
    for (const name of ['events', 'profiles', 'meta']) await this.write(name, (s) => { s.clear(); });
  }

  private async read<T>(store: string, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction(store, 'readonly').objectStore(store));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }

  private async write(store: string, fn: (s: IDBObjectStore) => void): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      fn(tx.objectStore(store));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = this.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('profileId', 'profileId');
        db.createObjectStore('profiles', { keyPath: 'id' });
        db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }
}
