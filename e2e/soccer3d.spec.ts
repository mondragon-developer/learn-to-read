import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function openGame(page: Page): Promise<void> {
  await page.goto('/'); await page.getByRole('button', { name: /set up a player/ }).waitFor();
  await page.evaluate(async () => {
    const r = indexedDB.open('goal-reader', 1);
    const db = await new Promise<IDBDatabase>((resolve) => { r.onsuccess = () => resolve(r.result); });
    const t = db.transaction('profiles', 'readwrite');
    t.objectStore('profiles').put({ v: 1, id: 'arena', firstName: 'Sam', number: 10, color: '#2D5BD0', createdAt: 1, updatedAt: 1,
      settings: { minutes: 5, startUnit: 1, writing: 'off', challenge: false, checkMode: 'independent', soccerBreaks: false, voice: 'teacher', shortsColor: '#142e46', cleatsColor: '#f68b36' } });
    await new Promise<void>((resolve) => { t.oncomplete = () => resolve(); }); db.close(); localStorage.setItem('goal-reader.player', 'arena');
  });
  await page.reload();
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => /\/Game[-.]|soccer3d\/Game/.test(entry.name)).length)).toBe(0);
  await page.getByRole('button', { name: 'Play soccer anytime' }).click();
  await expect(page.locator('.soccer-stage')).toHaveAttribute('data-renderer', 'three');
  await page.locator('.soccer-play').click();
  await expect(page.locator('.soccer-stage')).toHaveAttribute('data-phase', 'aim');
}

test('3D game loads on demand, touch shots score, modes and movable origins work', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { Math.random = () => .99; });
  const gameRequests: string[] = []; page.on('request', (r) => { if (/\/Game[-.]|soccer3d\/Game/.test(r.url())) gameRequests.push(r.url()); });
  await openGame(page);
  expect(gameRequests.length).toBeGreaterThan(0);
  const stage = page.locator('.soccer-stage'), field = page.locator('.soccer-control');
  const canvas = page.locator('canvas.soccer-field');
  await expect(canvas).toHaveAttribute('data-draw-calls', /\d+/);
  const budget = await canvas.evaluate((el) => ({ calls: Number(el.dataset.drawCalls), triangles: Number(el.dataset.triangles) }));
  expect(budget.calls).toBeLessThan(130); expect(budget.triangles).toBeLessThan(180000);
  // Move the aim to a corner with the accessible keys, then use the real projected points for touch.
  for (let i = 0; i < 4; i++) await field.press('ArrowRight');
  await page.waitForTimeout(80);
  const coords = await field.evaluate((el) => { const r = el.getBoundingClientRect(); return { ballX: r.x + Number(el.dataset.ballX), ballY: r.y + Number(el.dataset.ballY), aimX: r.x + Number(el.dataset.aimX), aimY: r.y + Number(el.dataset.aimY) }; });
  await page.mouse.move(coords.ballX, coords.ballY); await page.mouse.down();
  await expect(page.getByRole('meter', { name: 'Shot power' })).toHaveAttribute('aria-valuenow', /^(?:[7-9]\d|100)$/);
  await page.mouse.move(coords.aimX, coords.aimY, { steps: 8 }); await page.mouse.up();
  await expect(stage).toHaveAttribute('data-outcome', 'goal', { timeout: 10000 });
  await expect(page.locator('.stadium-score')).toHaveText('1');
  await page.screenshot({ path: `test-results/3d-goal-${info.project.name}.png` });
  await expect(page.getByRole('heading', { name: 'Shot 2 of 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Free kicks', exact: true }).click();
  await page.getByRole('button', { name: 'Left', exact: true }).click();
  await page.getByRole('button', { name: 'Near', exact: true }).click();
  await expect(stage).toHaveAttribute('data-origin-x', '-3'); await expect(stage).toHaveAttribute('data-origin-z', '9');
  await page.getByRole('button', { name: 'Targets', exact: true }).click();
  await field.press('Enter'); await expect(stage).toHaveAttribute('data-target-hit', 'true', { timeout: 10000 });
  await page.locator('.soccer-dialog-close').click();
  await page.getByRole('button', { name: 'Goal Reader', exact: true }).click();
  await expect(page.locator('.soccer-totals')).toContainText('2 goals');
  expect(errors).toEqual([]);
});

test('three shots and replays work offline; closing releases the graphics context', async ({ page }) => {
  await openGame(page); await page.getByRole('button', { name: 'Targets', exact: true }).click();
  await page.context().setOffline(true);
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('heading', { name: `Shot ${i + 1} of 3` })).toBeVisible();
    await page.locator('.soccer-control').press('Enter');
    await expect(page.locator('.soccer-stage')).toHaveAttribute('data-target-hit', 'true', { timeout: 10000 });
  }
  await expect(page.getByRole('heading', { name: 'Great shooting!' })).toBeVisible();
  await page.locator('.soccer-replay').click();
  await expect(page.getByRole('heading', { name: 'Shot 1 of 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Use lighter graphics' }).click();
  await page.locator('.soccer-control').press('Enter');
  await page.locator('canvas.soccer-field').evaluate((canvas) => { Object.assign(window, { soccerContext: (canvas as HTMLCanvasElement).getContext('webgl2') }); });
  await page.locator('.soccer-dialog-close').click();
  await expect(page.locator('.soccer-field')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { soccerContext: WebGL2RenderingContext }).soccerContext.isContextLost())).toBe(true);
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'Play soccer anytime' }).click();
  await expect(page.locator('.soccer-stage')).toHaveAttribute('data-renderer', 'three');
});

test('losing the graphics context safely offers the lightweight game', async ({ page }) => {
  await openGame(page);
  await page.locator('canvas.soccer-field').evaluate((canvas) => { (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext(); });
  await expect(page.locator('svg.soccer-field')).toBeVisible();
  await page.locator('.soccer-play').click(); await page.locator('.soccer-control').press('Enter');
  await expect(page.locator('.soccer-stage')).toHaveAttribute('data-outcome', /goal|saved/, { timeout: 10000 });
  await page.locator('.soccer-dialog-close').click();
  await expect(page.getByRole('button', { name: /Soccer Story Time/ })).toBeVisible();
});
