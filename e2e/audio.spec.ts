import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { preview } from 'vite';

const manifests: Record<string, Record<string, { file: string }>> = Object.fromEntries(['teacher', 'josh'].map((voice) => [voice, JSON.parse(
  readFileSync(new URL(`../src/data/audio-${voice === 'teacher' ? '' : 'josh-'}manifest.json`, import.meta.url), 'utf8'),
)]));

for (const voice of ['teacher', 'josh']) test(`${voice} Fish recordings decode and play after the origin server goes offline`, async ({ page }) => {
  // Playwright 1.63 WebKit kills even cached SW responses with setOffline(true):
  // https://github.com/microsoft/playwright/issues/42775
  // Each test owns an origin that is physically stopped after the cache installs.
  const server = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 0 } });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Preview did not start');
  const origin = `http://127.0.0.1:${address.port}`;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await new Promise<void>((resolve, reject) => {
      server.httpServer.close((error) => error ? reject(error) : resolve());
      server.httpServer.closeAllConnections();
    });
  };
  try {
    await page.addInitScript(() => {
      const probe = { recordingsPlayed: 0, deviceVoiceCalls: 0, files: [] as string[] };
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => { probe.files.push(String(args[0])); return originalFetch(...args); };
      Object.assign(window, { audioProbe: probe });
      const original = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
        if (this.buffer && this.buffer.duration > 0.1) probe.recordingsPlayed++;
        return original.apply(this, args);
      };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => [], cancel: () => undefined,
        speak: (utterance: SpeechSynthesisUtterance) => {
          probe.deviceVoiceCalls++;
          setTimeout(() => utterance.onend?.(new Event('end') as SpeechSynthesisEvent), 1);
        },
      } });
    });
    const recordings: Record<string, { file: string }> = manifests[voice]!;
    const keys = ['prompt:kickoff', 'word:cat'];
    const all = Object.keys(recordings);
    const selected = ['prompt', 'word', 'sound', 'sentence', 'story', 'slow'].map((kind) => {
      const key = keys.find((k) => k.startsWith(`${kind}:`) && recordings[k]) ?? all.find((k) => k.startsWith(`${kind}:`));
      if (!key) throw new Error(`Missing Fish recordings: ${kind}`);
      return recordings[key]!.file;
    });
    await page.goto(origin);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await page.getByRole('button', { name: /set up a player/ }).click();
    const hold = page.getByRole('button', { name: /Mantener presionado|Press and hold/ });
    const box = await hold.boundingBox();
    if (!box) throw new Error('Parent gate missing');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(3200); await page.mouse.up();
    const question = await page.locator('.gate p').first().textContent();
    const [a, b] = (question ?? '').match(/\d+/g)?.map(Number) ?? [];
    await page.locator('.gate-input').fill(String((a ?? 0) * (b ?? 0)));
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByPlaceholder('Leo').fill('Audio test');
    await page.getByRole('button', { name: /Crear jugador|Create player/ }).click();
    await page.getByRole('combobox', { name: /Voz de lectura|Reading voice/ }).selectOption(voice);
    await page.getByRole('button', { name: /^Guardar$|^Save$/ }).click();
    await page.getByRole('button', { name: /Volver al juego|Back to the game/ }).click();
    await page.reload(); // persisted voice must also be used after reopening the app
    const missing = await page.evaluate(async (files) => {
      const available = await Promise.all(files.map(async (file) => await caches.match(`/${file}`, { ignoreSearch: true }) ? null : file));
      return available.filter(Boolean);
    }, Object.values(recordings).map((r) => r.file));
    expect(missing).toEqual([]);
    await stop();
    await expect(fetch(origin, { signal: AbortSignal.timeout(3000) })).rejects.toThrow();
    const decoded = await page.evaluate(async (files) => {
      const audio = new AudioContext();
      try {
        const result = [];
        for (const file of files) {
          let response: Response;
          try { response = await fetch(`/${file}`); } catch (error) {
            const cached = await caches.match(`/${file}`, { ignoreSearch: true });
            throw new Error(`${file}: ${String(error)}; cached=${!!cached}; worker=${navigator.serviceWorker.controller?.state}`);
          }
          if (!response.ok) throw new Error(`Audio unavailable: ${file}`);
          const buffer = await audio.decodeAudioData(await response.arrayBuffer());
          let peak = 0;
          for (const value of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(value));
          result.push({ file, duration: buffer.duration, peak });
        }
        return result;
      } finally { await audio.close(); }
    }, selected);
    for (const clip of decoded) {
      expect(clip.duration, clip.file).toBeGreaterThan(0.1);
      expect(clip.peak, clip.file).toBeGreaterThan(0.01);
    }
    await page.getByRole('button', { name: /My words/ }).click();
    await page.getByLabel('Unit', { exact: true }).selectOption('1');
    await page.evaluate(() => { (window as unknown as { audioProbe: { files: string[] } }).audioProbe.files = []; });
    await page.getByRole('button', { name: 'cat', exact: true }).click();
    const probe = () => page.evaluate(() => (window as unknown as {
      audioProbe: { recordingsPlayed: number; deviceVoiceCalls: number; files: string[] };
    }).audioProbe);
    await expect.poll(async () => (await probe()).recordingsPlayed).toBeGreaterThan(0);
    expect((await probe()).deviceVoiceCalls).toBe(0);
    expect((await probe()).files).toContain(`/${recordings['word:cat']!.file}`);
  } finally { await stop(); }
});
