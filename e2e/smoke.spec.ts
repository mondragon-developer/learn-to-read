import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;

/** No real audio or mic in CI: device voice finishes instantly, no recognizer => Grown-up check mode. */
async function stubDevices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.webkitSpeechRecognition;
    delete w.SpeechRecognition;
    // Fake microphone + recorder. Each take is a real 0.6 s WAV tone so decoding, the length badge
    // and the loudness check all run for real. ?mic=denied makes the mic refuse instead.
    const denied = location.search.includes('mic=denied');
    const wav = (): Blob => {
      const rate = 8000; const n = Math.round(rate * 0.6);
      const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
      const str = (o: number, x: string): void => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
      v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5 * 32767), true);
      return new Blob([buf], { type: 'audio/wav' });
    };
    const fakeStream = { getTracks: () => [{ stop() { /* fake */ } }] };
    const getUserMedia = async (): Promise<unknown> => {
      if (denied) throw new DOMException('Permission denied', 'NotAllowedError');
      return fakeStream;
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    class FakeRecorder {
      static isTypeSupported(t: string): boolean { return t === 'audio/mp4'; }
      state = 'inactive';
      mimeType = 'audio/wav';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start(): void { this.state = 'recording'; }
      stop(): void { this.state = 'inactive'; this.ondataavailable?.({ data: wav() }); this.onstop?.(); }
    }
    w.MediaRecorder = FakeRecorder;
    // The meter taps the fake stream; give it a no-op source so it doesn't throw.
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext).prototype;
    AC.createMediaStreamSource = function (this: AudioContext) { return this.createGain() as unknown as MediaStreamAudioSourceNode; };
    // WebKit ignores assigning speechSynthesis.speak, so replace the whole object.
    const fakeSynth = {
      speak: (u: SpeechSynthesisUtterance) => { setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 5); },
      cancel: () => undefined, pause: () => undefined, resume: () => undefined, getVoices: () => [],
      speaking: false, pending: false, paused: false, onvoiceschanged: null,
      addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fakeSynth, configurable: true });
  });
}

async function passGate(page: Page): Promise<void> {
  const hold = page.getByRole('button', { name: /Mantener presionado|Press and hold/ });
  const box = await hold.boundingBox();
  if (!box) throw new Error('no hold button');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3200);
  await page.mouse.up();
  const q = await page.locator('.gate p').first().textContent();
  const [a, b] = (q ?? '').match(/\d+/g)?.map(Number) ?? [];
  await page.locator('.gate-input').fill(String((a ?? 0) * (b ?? 0)));
  await page.getByRole('button', { name: 'OK', exact: true }).click();
}

async function shot(page: Page, name: string, project: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${project}-${name}.png`, fullPage: false });
}

/** Plays the match like a cooperative child + grown-up until Full time (or until `stopWhen` is visible). */
async function playMatch(page: Page, project: string, stopWhen?: () => Promise<boolean>): Promise<void> {
  const order = [
    page.getByRole('button', { name: /Let’s go/ }),
    page.locator('.mic.rec'),
    page.getByRole('button', { name: /Read it right/ }),
    page.getByRole('button', { name: '✓ Read it', exact: true }),
    page.getByRole('button', { name: /✓ Yes/ }),
    page.locator('.ear:enabled'),
    page.locator('.options .choice'),
    page.locator('.word-choice'),
    page.locator('.strip:enabled'),
    page.locator('.drum'),
    page.getByRole('button', { name: /✓ Check/ }),
    page.getByRole('button', { name: /✓ Done/ }),
    page.getByRole('button', { name: /Looks the same/ }),
  ];
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    if (await page.getByRole('heading', { name: 'Full time!' }).isVisible()) return;
    if (stopWhen && await stopWhen()) return;
    const tag = (await page.locator('.stage .tag, .howto h2').first().textContent({ timeout: 200 }).catch(() => null)) ?? '';
    if (tag && !seen.has(tag)) { seen.add(tag); await shot(page, `step-${seen.size}`, project); }
    for (const loc of order) {
      const first = loc.first();
      if (await first.isVisible().catch(() => false)) { await first.click({ timeout: 1000 }).catch(() => undefined); break; }
    }
    await page.waitForTimeout(120);
  }
  throw new Error('match did not finish');
}

async function setUpPlayer(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /set up a player/ }).click();
  await passGate(page);
  await page.getByPlaceholder('Leo').fill('Sam');
  await page.getByRole('button', { name: /Crear jugador|Create player/ }).click();
  await page.getByRole('button', { name: /Volver al juego|Back to the game/ }).click();
}

test('the parent gate rejects a wrong answer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /set up a player/ }).click();
  const hold = page.getByRole('button', { name: /Mantener presionado|Press and hold/ });
  const box = await hold.boundingBox();
  if (!box) throw new Error('no hold button');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3200);
  await page.mouse.up();
  await page.locator('.gate-input').fill('1');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Área de padres' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Goal Reader' })).toBeVisible();
});

test('a blocked microphone shows the grown-up why, and the check still works', async ({ page }) => {
  await stubDevices(page);
  await setUpPlayer(page, '?mic=denied');
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await playMatch(page, 'denied', () => page.locator('.rec-badge.warn').first().isVisible());
  await expect(page.locator('.rec-badge.warn').first()).toContainText('micrófono está bloqueado');
  await expect(page.getByRole('button', { name: /Read it right|✓ Read it|✓ Yes/ }).first()).toBeVisible();
});

test('set up a player, play a full match, see the Spanish dashboard', async ({ page }, info) => {
  const project = info.project.name;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubDevices(page);
  await page.goto('/');
  await shot(page, 'welcome', project);

  await page.getByRole('button', { name: /set up a player/ }).click();
  await passGate(page);
  await page.getByPlaceholder('Leo').fill('Sam');
  await page.getByRole('button', { name: /Crear jugador|Create player/ }).click();
  await expect(page.getByText(/Duración de la sesión|Session length/)).toBeVisible();
  await page.getByLabel(/10 min/).check();
  await page.getByRole('button', { name: /^Guardar$|^Save$/ }).click();
  await page.getByRole('button', { name: /Volver al juego|Back to the game/ }).click();

  await expect(page.getByRole('heading', { name: 'Hi, Sam!' })).toBeVisible();
  await shot(page, 'home', project);
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await expect(page.getByRole('heading', { name: 'Today’s match' })).toBeVisible();
  await expect(page.locator('.grownup-note')).toBeVisible();
  await shot(page, 'plan', project);
  await page.getByRole('button', { name: /Kick off!/ }).click(); // in-session kickoff (unlocks audio)
  // His recording is captured, decoded and announced with its length.
  await playMatch(page, project, () => page.locator('.rec-badge.ok').first().isVisible());
  await expect(page.locator('.rec-badge.ok').first()).toHaveText(/Grabado: 0\.6 s/);
  await playMatch(page, project);
  await shot(page, 'fulltime', project);
  await expect(page.getByText(/You scored \d+ goal/)).toBeVisible();

  await page.getByRole('button', { name: /My stadium/ }).click();
  await expect(page.getByRole('heading', { name: /Sam’s stadium/ })).toBeVisible();
  await shot(page, 'stadium', project);

  // Word bank: hear a word, record and compare, trace it.
  await page.getByRole('button', { name: /Back to the field/ }).click();
  await page.getByRole('button', { name: /My words/ }).click();
  await page.locator('.word-btn').first().click();
  await expect(page.getByRole('button', { name: /Hear it/ })).toBeVisible();
  await page.getByRole('button', { name: /Say it & hear me/ }).click();
  await page.locator('.mic.rec').click();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.locator('.rec-badge.ok')).toContainText('0.6 s');
  await expect(page.getByRole('button', { name: /Hear both again/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /Para mamá/ }).click();
  await expect(page.locator('.es-gloss')).toBeVisible();
  await shot(page, 'wordbank', project);

  await page.locator('.lock').click();
  await passGate(page);
  await expect(page.getByRole('heading', { name: 'Área de padres' })).toBeVisible();
  await expect(page.getByText('Minutos de práctica por día (últimos 14 días)')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lectura oración por oración' })).toBeVisible();
  await expect(page.locator('.sentence-log li').first()).toBeVisible(); // the coach recorded at least one sentence
  await shot(page, 'parent', project);

  // Every parent tab renders (each is its own module).
  await page.getByRole('tab', { name: 'Ajustes' }).click();
  await expect(page.getByText('Duración de la sesión')).toBeVisible();
  await page.getByRole('tab', { name: 'Jugadores' }).click();
  await expect(page.getByRole('button', { name: 'Crear jugador' })).toBeVisible();
  await page.getByRole('tab', { name: 'Cuenta y respaldo' }).click();
  await expect(page.getByRole('button', { name: 'Descargar respaldo' })).toBeVisible();
  await page.getByRole('tab', { name: 'Ayuda' }).click();
  await expect(page.getByRole('button', { name: /Revisar los audios/ })).toBeVisible();
  expect(errors).toEqual([]);
});
