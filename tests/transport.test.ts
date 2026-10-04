import { describe, expect, it } from 'vitest';
import { Transport } from '../src/ui/activities/transport';
import type { AudioPort } from '../src/domain/audio/AudioPort';

const silentAudio = (): AudioPort & { stops: number } => {
  const a = { stops: 0, unlock: async () => undefined, play: async () => undefined, sequence: async () => undefined, follow: async () => undefined, has: () => false, stop: () => { a.stops++; } };
  return a;
};

describe('Transport', () => {
  it('pause stops audio and the interrupted piece plays again after continue', async () => {
    const audio = silentAudio();
    const t = new Transport(audio);
    let plays = 0;
    const run = t.run(async (stopped) => {
      plays++;
      if (plays === 1) { t.pause(); expect(stopped()).toBe(true); }
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(t.paused).toBe(true);
    t.resume();
    await run;
    expect(plays).toBe(2);
    expect(audio.stops).toBe(1);
  });

  it('a command ends the piece for good and is taken once', async () => {
    const t = new Transport(silentAudio());
    await t.run(async () => { t.send('next'); });
    expect(t.take()).toBe('next');
    expect(t.take()).toBeNull();
  });

  it('disposed command waiters are not kept (no leak per word)', async () => {
    const t = new Transport(silentAudio());
    for (let i = 0; i < 50; i++) t.nextCommand().dispose();
    const live = t.nextCommand();
    t.send('word');
    await expect(live.promise).resolves.toBe('word');
    expect((t as unknown as { commandWaiters: unknown[] }).commandWaiters).toHaveLength(0);
  });
});
