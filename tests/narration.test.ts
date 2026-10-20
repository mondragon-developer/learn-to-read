import { describe, expect, it } from 'vitest';
import { Kit } from '../src/ui/activities/kit';
import { DEFAULT_SETTINGS, type Profile } from '../src/domain/profiles/Profile';
import type { AppContext } from '../src/ui/context';
import type { AudioPort } from '../src/domain/audio/AudioPort';

function setup(): { kit: Kit; played: string[] } {
  const played: string[] = [];
  let end: (() => void) | undefined;
  const audio: AudioPort = {
    unlock: async () => undefined, has: () => true,
    play: (key) => { played.push(key); return new Promise<void>((resolve) => { end = resolve; }); },
    stop: () => { const done = end; end = undefined; done?.(); },
    sequence: async () => undefined, follow: async () => undefined,
  };
  const profile: Profile = { v: 1, id: 'p', firstName: 'Sam', number: 7, color: '#1F7A4D', createdAt: 0, updatedAt: 0, settings: DEFAULT_SETTINGS };
  const ctx = { audio, checker: { available: false, cancel: () => undefined }, recorder: { available: false, stop: () => undefined } } as unknown as AppContext;
  return { kit: new Kit(ctx, profile, 'session', () => undefined), played };
}

describe('interruptible teacher narration', () => {
  it('taking a turn prevents later clips in a demonstration from starting', async () => {
    const { kit, played } = setup();
    const stop = kit.narrate(async (voice) => { await voice.prompt('listen'); await voice.word('cat'); });
    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(played).toEqual(['prompt:listen']);
    expect(kit.closed).toBe(false);
    kit.cancel();
  });
  it('an early answer cancels even a replacement replay without closing the activity', async () => {
    const { kit, played } = setup();
    let answer!: (n: number) => void;
    const result = kit.respond(async (voice) => { await voice.word('cat'); await voice.word('map'); },
      new Promise<number>((resolve) => { answer = resolve; }));
    kit.narrate(async (voice) => { await voice.word('sat'); await voice.word('pan'); });
    answer(2);
    expect(await result).toBe(2);
    await Promise.resolve();
    expect(played).toEqual(['word:cat', 'word:sat']);
    expect(kit.closed).toBe(false);
    kit.cancel();
  });
  it('leaving the activity stops the current clip and its remaining queue', async () => {
    const { kit, played } = setup();
    kit.narrate(async (voice) => { await voice.word('cat'); await voice.word('map'); });
    kit.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(played).toEqual(['word:cat']);
  });
});
