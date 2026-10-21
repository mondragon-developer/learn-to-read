import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbStore } from '../src/domain/storage/IndexedDbStore';
import { MemoryStore, type LocalStore } from '../src/domain/storage/LocalStore';
import { FakeRemote, type RemoteStore } from '../src/domain/storage/RemoteStore';
import { PracticeLog, type NewEvent } from '../src/domain/storage/PracticeLog';
import { ProfileRepository } from '../src/domain/storage/ProfileRepository';
import { SyncService } from '../src/domain/storage/SyncService';
import { BackupService } from '../src/domain/storage/BackupService';
import { Outbox } from '../src/domain/storage/Outbox';
import { FixedClock } from '../src/domain/time/Clock';
import { DEFAULT_SETTINGS, type Profile } from '../src/domain/profiles/Profile';
import { rebuildDeck } from '../src/domain/srs/Leitner';

const read = (itemId: string, outcome: NewEvent['outcome'] = 'first-try'): NewEvent =>
  ({ profileId: 'p1', activity: 'review', itemId, outcome, source: 'mic' });
const profile = (name: string): Profile => ({ v: 1, id: 'p1', firstName: name, color: '#1F7A4D', number: 10, createdAt: 1, updatedAt: 1, settings: DEFAULT_SETTINGS });

let ids = 0;
const idGen = (prefix: string) => () => `${prefix}-${++ids}`;

function contract(name: string, make: () => LocalStore): void {
  describe(`${name} (LocalStore contract)`, () => {
    it('stores events idempotently and filters by profile', async () => {
      const s = make();
      const e = { v: 1 as const, id: 'a', profileId: 'p1', at: 1, day: 0, activity: 'review' as const, itemId: 'w:cat', outcome: 'first-try' as const, source: 'mic' as const };
      await s.putEvents([e, { ...e, id: 'b', profileId: 'p2' }]);
      await s.putEvents([{ ...e, itemId: 'w:changed' }]); // same id: ignored
      expect((await s.events('p1')).map((x) => x.itemId)).toEqual(['w:cat']);
      expect(await s.allEvents()).toHaveLength(2);
    });

    it('stores profiles and meta, and clears', async () => {
      const s = make();
      await s.putProfiles([profile('Sam')]);
      await s.setMeta('cursor', '7');
      expect((await s.profiles())[0]?.firstName).toBe('Sam');
      expect(await s.getMeta('cursor')).toBe('7');
      await s.clear();
      expect(await s.profiles()).toEqual([]);
      expect(await s.getMeta('cursor')).toBeUndefined();
    });
  });
}

contract('MemoryStore', () => new MemoryStore());
contract('IndexedDbStore', () => new IndexedDbStore(new IDBFactory()));

/** One device: its own local store wired like main.ts does it. */
function device(remote: RemoteStore | null, clock: FixedClock, prefix: string) {
  const local = new MemoryStore();
  const outbox = new Outbox(local);
  const profiles = new ProfileRepository(local, clock);
  return {
    log: new PracticeLog(local, outbox, clock, idGen(prefix)),
    profiles,
    sync: new SyncService(local, outbox, profiles, remote),
    backup: new BackupService(local, outbox, profiles, clock),
  };
}

describe('sync between devices', () => {
  it('records offline, then pushes the outbox once online', async () => {
    const remote = new FakeRemote();
    remote.online = false;
    const ipad = device(remote, new FixedClock(0), 'ipad');
    await ipad.log.record(read('w:cat'));
    expect((await ipad.sync.sync()).ok).toBe(false);
    expect(await ipad.log.pending()).toBe(1);
    remote.online = true;
    expect(await ipad.sync.sync()).toMatchObject({ ok: true, pushed: 1 });
    expect(await ipad.log.pending()).toBe(0);
    expect(remote.size).toBe(1);
  });

  it('two devices practicing offline end with the same history and the same deck', async () => {
    const remote = new FakeRemote();
    const clock = new FixedClock(0);
    const ipad = device(remote, clock, 'ipad');
    const iphone = device(remote, clock, 'iphone');
    await ipad.log.record({ ...read('w:cat'), activity: 'new-word' });
    clock.advanceDays(1);
    await iphone.log.record({ ...read('w:map'), activity: 'new-word' });
    await ipad.log.record(read('w:cat'));
    for (let i = 0; i < 2; i++) { await ipad.sync.sync(); await iphone.sync.sync(); }
    const a = await ipad.log.events('p1');
    const b = await iphone.log.events('p1');
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a).toHaveLength(3);
    expect(rebuildDeck(a)).toEqual(rebuildDeck(b));
    expect(remote.size).toBe(3); // nothing duplicated on the server
  });

  it('syncs profile edits, newest wins', async () => {
    const remote = new FakeRemote();
    const clock = new FixedClock(1000);
    const ipad = device(remote, clock, 'ipad');
    const mac = device(remote, clock, 'mac');
    await ipad.profiles.save(profile('Sam'));
    await ipad.sync.sync();
    await mac.sync.sync();
    clock.advanceMs(5);
    await mac.profiles.save(profile('Samuel'));
    await mac.sync.sync();
    await ipad.sync.sync();
    expect((await ipad.profiles.list())[0]?.firstName).toBe('Samuel');
  });

  it('sync without an account reports not signed in', async () => {
    const solo = device(null, new FixedClock(0), 'solo');
    expect(await solo.sync.sync()).toMatchObject({ ok: false, error: 'not signed in' });
  });
});

describe('BackupService', () => {
  it('export/import is a union and queues imported events for upload', async () => {
    const a = device(null, new FixedClock(0), 'a');
    await a.log.record(read('w:cat'));
    await a.profiles.save(profile('Sam'));
    const json = await a.backup.exportJson();
    const b = device(null, new FixedClock(0), 'b');
    await b.log.record(read('w:map'));
    expect(await b.backup.importJson(json)).toEqual({ events: 1, profiles: 1 });
    expect(await b.backup.importJson(json)).toEqual({ events: 0, profiles: 1 });
    expect((await b.log.events('p1')).map((e) => e.itemId).sort()).toEqual(['w:cat', 'w:map']);
    expect(await b.log.pending()).toBe(2);
    expect(await b.profiles.isDirty()).toBe(true);
    await expect(b.backup.importJson('{"app":"other"}')).rejects.toThrow();
  });
});

describe('Outbox', () => {
  it('never drops an id when a record and a sync interleave (either order)', async () => {
    for (const order of ['add-first', 'remove-first'] as const) {
      const outbox = new Outbox(new MemoryStore());
      await outbox.add(['a', 'b']);
      const add = (): Promise<void> => outbox.add(['c']);
      const remove = (): Promise<void> => outbox.remove(new Set(['a', 'b']));
      await Promise.all(order === 'add-first' ? [add(), remove()] : [remove(), add()]);
      expect(await outbox.ids()).toEqual(['c']);
    }
  });

  it('an event recorded during an upload is still queued afterwards', async () => {
    const remote = new FakeRemote();
    const clock = new FixedClock(0);
    const ipad = device(remote, clock, 'race');
    await ipad.log.record(read('w:cat'));
    const syncing = ipad.sync.sync();
    await ipad.log.record(read('w:map')); // lands while the push is in flight
    await syncing;
    await ipad.sync.sync();
    expect(remote.size).toBe(2);
    expect(await ipad.log.pending()).toBe(0);
  });
});

describe('BackupService validation', () => {
  it('skips malformed events and repairs profiles instead of breaking the app', async () => {
    const b = device(null, new FixedClock(0), 'v');
    const good = { v: 1, id: 'g1', profileId: 'p1', at: 1, day: 0, activity: 'review', itemId: 'w:cat', outcome: 'first-try', source: 'mic' };
    const json = JSON.stringify({
      app: 'goal-reader',
      events: [good, { v: 1, id: 'bad1', profileId: 'p1', at: 1, day: 0, activity: 'review', outcome: 'first-try' }, { ...good, id: 'bad2', activity: 'hack' }, 'nope'],
      profiles: [
        { id: 'p1', firstName: 'Sam', color: 'red;background:url(https://x)', number: 500 },
        { firstName: 'no id' },
      ],
    });
    expect(await b.backup.importJson(json)).toEqual({ events: 1, profiles: 1 });
    const [p] = await b.profiles.list();
    expect(p).toMatchObject({ id: 'p1', color: '#1F7A4D', number: 99, settings: { minutes: 10 } });
    expect(rebuildDeck(await b.log.events('p1')).size).toBe(0); // only the review event, no crash
  });
});

import { soccerTotals } from '../src/domain/rewards/Soccer';
import { trophies } from '../src/domain/rewards/Rewards';

it('keeps soccer totals per student through offline sync and backup, without reading rewards', async () => {
  const remote = new FakeRemote();
  const ipad = device(remote, new FixedClock(0), 'soccer-ipad');
  const laptop = device(remote, new FixedClock(0), 'soccer-laptop');
  for (const [profileId, result] of [['p1', 'goal'], ['p1', 'saved'], ['p2', 'goal']]) {
    await ipad.log.record({ profileId: profileId!, activity: 'soccer', itemId: 'soccer:test', outcome: 'unverified', source: 'tap', meta: { result: result! } });
  }
  expect(soccerTotals(await ipad.log.events('p1'))).toEqual({ goals: 1, saves: 1, shots: 2 });
  expect(trophies(await ipad.log.events('p1'), 0)).toMatchObject({ goals: 0, streak: 0 });
  await ipad.sync.sync();
  await laptop.sync.sync();
  expect(soccerTotals(await laptop.log.events('p2'))).toEqual({ goals: 1, saves: 0, shots: 1 });
  const restored = device(null, new FixedClock(0), 'restored');
  await restored.backup.importJson(await ipad.backup.exportJson());
  expect(soccerTotals(await restored.log.events('p1'))).toEqual({ goals: 1, saves: 1, shots: 2 });
});
