import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ serviceWorkers: 'block' });
async function setup(page: Page, voice = 'teacher'): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /set up a player/ }).waitFor();
  await page.evaluate(async (voice) => {
    const req = indexedDB.open('goal-reader', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const tx = db.transaction('profiles', 'readwrite');
    tx.objectStore('profiles').put({ v: 1, id: 'story-test', firstName: 'Sam', number: 7, color: '#1F7A4D', createdAt: 1, updatedAt: 1,
      settings: { minutes: 5, startUnit: 1, writing: 'off', challenge: false, checkMode: 'independent', readingPace: 'follow', storyReading: 'sentences', soccerBreaks: false, voice } });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
    localStorage.setItem('goal-reader.player', 'story-test');
  }, voice);
  await page.reload();
}
async function events(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const req = indexedDB.open('goal-reader', 1);
    const db = await new Promise<IDBDatabase>((resolve) => { req.onsuccess = () => resolve(req.result); });
    const r = db.transaction('events').objectStore('events').getAll();
    return new Promise<unknown[]>((resolve) => { r.onsuccess = () => { db.close(); resolve(r.result.filter((e: { activity: string }) => e.activity !== 'soccer')); }; });
  });
}

test('home story entrance, reading position, optional questions and soccer return', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.getByRole('button', { name: /Soccer Story Time/ }).click();
  await expect(page.locator('.story-card').filter({ hasText: 'sentences' })).toHaveCount(28);
  await page.getByRole('button', { name: 'Read Harry Tries Again together' }).click();
  await expect(page.locator('.story-time-line:visible')).toHaveText('Harry Kane loved soccer when he was a boy.');
  await page.locator('.story-time-next').click();
  await page.getByRole('button', { name: 'Play soccer anytime' }).click();
  const dialog = page.getByRole('dialog', { name: 'Soccer play break' });
  await dialog.getByRole('button', { name: 'Targets', exact: true }).click();
  await dialog.getByRole('button', { name: 'Left', exact: true }).click();
  await dialog.getByRole('button', { name: 'Near', exact: true }).click();
  await expect(dialog.locator('.soccer-ball')).toHaveAttribute('transform', 'translate(220 335)');
  await expect(dialog.locator('.soccer-keeper')).toHaveAttribute('visibility', 'hidden');
  await dialog.locator('.soccer-control').press('Enter');
  await expect(dialog.locator('.soccer-stage')).toHaveAttribute('data-outcome', /goal|wide|post|bar|short/);
  await dialog.locator('.soccer-dialog-close').click();
  await expect(page.locator('.story-time-line:visible')).toHaveText('He played in a park with his dad and brother.');
  await page.reload();
  await page.getByRole('button', { name: /Soccer Story Time/ }).click();
  await page.locator('.story-continue').click();
  await expect(page.locator('.story-time-line:visible')).toHaveText('He played in a park with his dad and brother.');
  for (let i = 0; i < 6; i++) await page.locator('.story-time-next').click();
  await expect(page.getByRole('heading', { name: 'The end', exact: true })).toBeVisible();
  expect(await events(page)).toEqual([]);
  await page.screenshot({ path: `test-results/storytime-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Questions & activities' }).click();
  await expect(page.locator('.question')).toContainText('What did Harry use as a goal?');
  expect(errors).toEqual([]);
});

for (const voice of ['teacher', 'josh']) test(`${voice} narrates every story sentence with real Fish recordings`, async ({ page }) => {
  const manifest = JSON.parse(readFileSync(`src/data/audio-${voice === 'josh' ? 'josh-' : ''}manifest.json`, 'utf8')) as Record<string, { file: string }>;
  await page.addInitScript(() => {
    const probe = { played: 0, device: 0 }; Object.assign(window, { storyAudioProbe: probe });
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.buffer && this.buffer.duration > .1) { probe.played++; this.playbackRate.value = 8; }
      return start.apply(this, args);
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => undefined, speak: (u: SpeechSynthesisUtterance) => { probe.device++; setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 1); },
    } });
  });
  const files: string[] = []; page.on('request', (r) => { if (r.url().includes('/audio/')) files.push(new URL(r.url()).pathname); });
  await setup(page, voice);
  await page.getByRole('button', { name: /Soccer Story Time/ }).click();
  await page.getByRole('button', { name: 'Listen to Cristiano and the Big Step', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The end', exact: true })).toBeVisible({ timeout: 30000 });
  for (const part of ['title', '0', '1', '2', '3', '4', '5', '6']) expect(files).toContain(`/${manifest[`story:soccer-ronaldo:${part}`]!.file}`);
  const probe = await page.evaluate(() => (window as unknown as { storyAudioProbe: { played: number; device: number } }).storyAudioProbe);
  expect(probe.played).toBe(8); expect(probe.device).toBe(0); expect(await events(page)).toEqual([]);
  // A completed whole-story replay starts from the first sentence again.
  await page.locator('.story-time-play').click();
  await expect(page.locator('.story-time-controls [role=status]')).toHaveText('Sentence 1 of 7');
  await page.locator('.story-time-play').click();
});

test('anytime soccer pauses a lesson and does not advance or grade it', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await expect(page.locator('.stage .tag').first()).toBeVisible();
  const before = await page.locator('.stage-host').innerText();
  const recorded = await events(page);
  await page.getByRole('button', { name: 'Play soccer anytime' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Penalties', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.soccer-position')).toBeHidden();
  await page.getByRole('dialog').locator('.soccer-dialog-close').click();
  await expect(page.locator('.stage-host')).toHaveText(before.replace(/\s+/g, ' ').trim(), { useInnerText: true });
  expect(await events(page)).toEqual(recorded);
  await page.getByRole('button', { name: 'Play soccer anytime' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a play break preserves the fluency clock and marked words', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: /Practice a skill/ }).click();
  const hold = page.locator('.hold.quick'); const box = (await hold.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1600); await page.mouse.up();
  await page.getByRole('button', { name: /1-minute read/ }).click();
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await page.getByRole('button', { name: /Empezar \(1 minuto\)/ }).click();
  await page.locator('.fl-text .w').nth(1).click();
  await expect(page.locator('.fl-clock')).toHaveText('0:59');
  await page.getByRole('button', { name: 'Play soccer anytime' }).click();
  const pausedClock = await page.locator('.fl-clock').textContent();
  await page.waitForTimeout(2200);
  expect(await page.locator('.fl-clock').textContent()).toBe(pausedClock);
  await page.getByRole('dialog').locator('.soccer-dialog-close').click();
  await expect(page.locator('.fl-text .w').nth(1)).toHaveClass(/miss/);
  await expect(page.locator('.fl-clock')).not.toHaveText('1:00');
  await expect(page.locator('.fl-clock')).not.toHaveText(pausedClock!);
  expect(await events(page)).toEqual([]);
});

test('soccer animation stops when hidden or closed and stays responsive', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const pending = new Set<number>(); Object.assign(window, { pendingFrames: pending });
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => { const id = request((time) => { pending.delete(id); callback(time); }); pending.add(id); return id; };
    window.cancelAnimationFrame = (id) => { pending.delete(id); cancel(id); };
  });
  await setup(page);
  await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Play soccer anytime' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Free kicks', exact: true }).click();
  await page.getByRole('dialog').locator('.soccer-control').press('Enter');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Shot 2 of 3' })).toBeVisible();
  await page.getByRole('dialog').locator('.soccer-control').press('Enter');
  const metrics = await page.evaluate(async () => {
    const gaps: number[] = []; let last = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number): void => { gaps.push(now - last); last = now; if (gaps.length < 90) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    });
    const sorted = gaps.slice(1).sort((a, b) => a - b);
    return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)], frames: sorted.length };
  });
  await info.attach('frame-timing', { body: JSON.stringify(metrics), contentType: 'application/json' });
  console.log(`${info.project.name} active-shot frame timing: ${JSON.stringify(metrics)}`);
  const frames = () => page.evaluate(() => (window as unknown as { pendingFrames: Set<number> }).pendingFrames.size);
  await expect.poll(frames).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(frames).toBe(0);
  await page.evaluate(() => { delete (document as unknown as { hidden?: boolean }).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(frames).toBe(1);
  await expect(page.getByRole('dialog').locator('.soccer-stage')).toHaveAttribute('data-outcome', /goal|saved|wall|short|post|bar|wide/);
  await page.screenshot({ path: `test-results/game-${info.project.name}.png`, fullPage: true });
  await page.getByRole('dialog').locator('.soccer-dialog-close').click();
  await expect.poll(frames).toBe(0);
});
