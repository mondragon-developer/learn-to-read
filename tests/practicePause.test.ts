import { expect, it, vi } from 'vitest';
import { PracticePause } from '../src/ui/activities/practicePause';

it('freezes the reading clock during play and resumes without counting soccer seconds', async () => {
  let time = 1000;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => time);
  try {
    const pause = new PracticePause();
    const resume = pause.pause();
    let continued = false;
    const waiting = pause.wait().then(() => { continued = true; });
    time = 21000;
    expect(pause.now()).toBe(1000);
    expect(continued).toBe(false);
    resume();
    resume();
    await waiting;
    expect(continued).toBe(true);
    time = 22000;
    expect(pause.now()).toBe(2000);
  } finally { clock.mockRestore(); }
});
