import { expect, test } from '@playwright/test';
import { preview } from 'vite';

test('installed app opens its first 3D game with the origin offline', async ({ page }) => {
  // Physically stop the origin: WebKit's emulated offline mode also blocks SW responses.
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
    await page.goto(origin);
    await page.getByRole('button', { name: /set up a player/ }).waitFor();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
      const request = indexedDB.open('goal-reader', 1);
      const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
      const tx = db.transaction('profiles', 'readwrite');
      tx.objectStore('profiles').put({ v: 1, id: 'offline-arena', firstName: 'Sam', number: 10, color: '#2D5BD0', createdAt: 1, updatedAt: 1,
        settings: { minutes: 5, startUnit: 1, writing: 'off', challenge: false, checkMode: 'independent', soccerBreaks: false, voice: 'teacher' } });
      await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
      db.close(); localStorage.setItem('goal-reader.player', 'offline-arena');
    });
    await stop();
    await expect(fetch(origin, { signal: AbortSignal.timeout(3000) })).rejects.toThrow();
    await page.reload();
    await page.getByRole('button', { name: 'Play soccer anytime' }).click();
    await expect(page.locator('.soccer-stage')).toHaveAttribute('data-renderer', 'three');
    await page.locator('.soccer-play').click();
    await page.getByRole('button', { name: 'Targets', exact: true }).click();
    await page.locator('.soccer-control').press('Enter');
    await expect(page.locator('.soccer-stage')).toHaveAttribute('data-target-hit', 'true', { timeout: 10000 });
  } finally { await stop(); }
});
