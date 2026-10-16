import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSpeechChecker } from '../src/platform/WebSpeechChecker';

let starts = 0;
class SilentRecognizer {
  start(): void { starts++; }
  abort(): void {}
}
beforeEach(() => {
  starts = 0;
  vi.useFakeTimers();
  vi.stubGlobal('window', { webkitSpeechRecognition: SilentRecognizer });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('speech recognition escape', () => {
  it('does not open the microphone after navigation or listen-and-repeat during the audio delay', async () => {
    const checker = new WebSpeechChecker();
    const pending = checker.listen({ expected: 'cat', mode: 'word' });
    checker.cancel();
    await vi.advanceTimersByTimeAsync(300);
    expect(await pending).toMatchObject({ status: 'silence', alternatives: [] });
    expect(starts).toBe(0);
  });

  it('times out a recognizer that never responds so independent practice can continue', async () => {
    const pending = new WebSpeechChecker().listen({ expected: 'cat', mode: 'word', timeoutMs: 6000 });
    await vi.advanceTimersByTimeAsync(6300);
    expect(await pending).toMatchObject({ status: 'hung', alternatives: [] });
    expect(starts).toBe(1);
  });
});
