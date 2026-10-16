import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS_DIR;
test.use({ serviceWorkers: 'block' });

/** No real audio or mic in CI: device voice finishes instantly, no recognizer => Grown-up check mode. */
async function stubDevices(page: Page): Promise<void> {
  // Flow tests use short valid recordings; real Fish playback is checked separately.
  await page.route('**/audio/**', async (route) => {
    const samples = 160; const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
    wav.writeUInt32LE(samples * 2, 40);
    await route.fulfill({ contentType: 'audio/wav', body: wav });
  });
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
    page.locator('.read-continue'),
    page.locator('.mic.rec'),
    page.getByRole('button', { name: /Read it right/ }),
    page.getByRole('button', { name: '✓ Read it', exact: true }),
    page.getByRole('button', { name: /He told it/ }),
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

async function setUpPlayer(page: Page, query = '', independent = false): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByRole('button', { name: /set up a player/ }).click();
  await passGate(page);
  await page.getByPlaceholder('Leo').fill('Sam');
  await page.getByRole('button', { name: /Crear jugador|Create player/ }).click();
  await page.locator(`input[name=check][value=${independent ? 'independent' : 'record'}]`).check();
  await page.getByRole('button', { name: /^Guardar$|^Save$/ }).click();
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

test('practice a skill: menu by Florida standard, sound boxes, one-minute read', async ({ page }) => {
  await stubDevices(page);
  await setUpPlayer(page);
  const hold = async (name: RegExp): Promise<void> => {
    const box = await page.getByRole('button', { name }).boundingBox();
    if (!box) throw new Error('no hold button');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1700);
    await page.mouse.up();
  };
  await page.getByRole('button', { name: /Practice a skill/ }).click();
  await hold(/mantenga presionado|press and hold/i);
  await expect(page.getByRole('heading', { name: /Practicar una habilidad/ })).toBeVisible();
  await expect(page.getByText('ELA.1.F.1.2.a · ELA.1.F.1.2.d')).toBeVisible();
  await expect(page.locator('.topic-card.rec')).toHaveCount(1);
  await expect(page.getByText('Repaso de kínder')).toBeVisible();

  // Sound boxes: 3 rounds, tap boxes, done.
  await page.getByRole('button', { name: /Sound boxes/ }).click();
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await expect(page.locator('.tag').first()).toContainText(/Sound boxes 1 of \d/);
  const fullTime = page.getByRole('heading', { name: 'Full time!' });
  for (let round = 1; round <= 12 && !(await fullTime.isVisible()); round++) {
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'One sound' }).click();
    await page.getByRole('button', { name: '✓ Done' }).click();
    // Wait out the answer reveal: the next round's counter, or Full time.
    await expect(page.locator('.tag').filter({ hasText: `Sound boxes ${round + 1} of` }).or(fullTime)).toBeVisible({ timeout: 10_000 });
  }
  await expect(page.getByRole('heading', { name: 'Full time!' })).toBeVisible({ timeout: 20_000 });

  // One-minute read.
  await page.getByRole('button', { name: 'Done for today' }).click();
  await page.getByRole('button', { name: /Practice a skill/ }).click();
  await hold(/mantenga presionado|press and hold/i);
  await page.getByRole('button', { name: /1-minute read/ }).click();
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await page.getByRole('button', { name: /Empezar \(1 minuto\)/ }).click();
  await page.locator('.fl-text .w').nth(1).click(); // misread word
  await page.getByRole('button', { name: /Terminó antes/ }).click();
  await page.locator('.fl-text .w').nth(9).click(); // last word read
  await page.getByRole('button', { name: /Fluido y con expresión/ }).click();
  await expect(page.locator('.fl-score')).toContainText('palabras correctas por minuto');
  await page.getByRole('button', { name: '⚽ Next' }).click();
  await expect(page.getByRole('heading', { name: 'Full time!' })).toBeVisible({ timeout: 20_000 });

  // Parent summary shows the standards and the one-minute read.
  await page.locator('.lock').click();
  await passGate(page);
  await page.getByRole('tab', { name: 'Resumen' }).click();
  await expect(page.getByRole('heading', { name: 'Estándares B.E.S.T. de Florida practicados' })).toBeVisible();
  await expect(page.locator('.std-row').first()).toContainText('ELA.1.F.1.2.a');
  await expect(page.getByRole('heading', { name: /Lectura de 1 minuto/ })).toBeVisible();
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
  await page.locator('input[name=check][value=record]').check();
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
  await page.getByRole('tab', { name: 'Resumen' }).click();
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

/** Complete a child-only session: adult approval controls must never appear. */
async function playIndependently(page: Page, project = '', stopWhen?: () => Promise<boolean>): Promise<void> {
  const controls = [
    page.getByRole('button', { name: /Let’s go/ }),
    page.locator('.read-continue'),
    page.locator('.practice-next'),
    page.locator('.mic:not(:disabled)'),
    page.locator('.ear:enabled'),
    page.locator('.options .choice:enabled'),
    page.locator('.word-choice:enabled'),
    page.locator('.strip:enabled'),
    page.locator('.drum'),
    page.getByRole('button', { name: /✓ Check|✓ Done/ }),
  ];
  let captured = false;
  for (let i = 0; i < 700; i++) {
    if (stopWhen && await stopWhen()) return;
    if (!captured && project && await page.locator('.practice-next').isVisible()) {
      captured = true; await shot(page, 'independent-repeat', project);
    }
    if (await page.getByRole('heading', { name: 'Full time!' }).isVisible()) return;
    await expect(page.locator('.grownup-q, .grownup-note')).toHaveCount(0);
    for (const loc of controls) {
      if (await loc.first().isVisible().catch(() => false)) {
        await loc.first().click({ timeout: 800 }).catch(() => undefined);
        break;
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Independent session did not finish');
}

for (const mode of ['unavailable', 'denied'] as const) {
  test(`independent practice completes with ${mode} microphone and records unverified reads`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await stubDevices(page);
    if (mode === 'denied') await page.addInitScript(() => {
      class DeniedMic {
        onerror: ((e: { error: string }) => void) | null = null;
        start(): void { setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 5); }
        abort(): void {}
      }
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition = DeniedMic;
    });
    await setUpPlayer(page);
    await page.locator('.lock').click();
    await passGate(page);
    await page.getByRole('tab', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Preparar práctica independiente en iPad' }).click();
    await expect(page.locator('input[name=check][value=independent]')).toBeChecked();
    if (mode === 'unavailable') {
      // Includes the story, questions, ordering and retelling branches.
      await page.getByLabel(/10 min/).check();
      await page.getByRole('button', { name: /^Guardar$/ }).click();
    }
    await page.getByRole('button', { name: /Volver al juego/ }).click();
    await page.getByRole('button', { name: /Kick off!/ }).click();
    await expect(page.getByRole('heading', { name: 'Today’s match' })).toHaveCount(0);
    await playIndependently(page, info.project.name);
    await shot(page, `independent-${mode}-finished`, info.project.name);
    await page.locator('.lock').click();
    await passGate(page);
  await page.getByRole('tab', { name: 'Resumen' }).click();
    await expect(page.getByRole('heading', { name: 'Practicado · sin verificar' })).toBeVisible();
    await expect(page.locator('.unverified-review li')).not.toHaveCount(0);
    await expect(page.locator('.sentence-log')).toHaveCount(0);
    await shot(page, `independent-${mode}-summary`, info.project.name);
    expect(errors).toEqual([]);
  });
}

test('independent healthy microphone verifies words and sentences', async ({ page }) => {
  await stubDevices(page);
  await page.addInitScript(() => {
    class ReadingMic {
      onresult: ((e: unknown) => void) | null = null;
      timer = 0;
      start(): void {
        const text = document.querySelector('.word')?.textContent
          ?? Array.from(document.querySelectorAll('.sentence .chip')).map((b) => b.textContent).join(' ');
        this.timer = window.setTimeout(() => this.onresult?.({ resultIndex: 0, results: [
          { 0: { transcript: text || 'cat', confidence: 1 }, length: 1, isFinal: true },
        ] }), 10);
      }
      abort(): void { clearTimeout(this.timer); }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = ReadingMic;
  });
  await setUpPlayer(page, '', true);
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await playIndependently(page);
  const reads = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open('goal-reader'); req.onsuccess = () => resolve(req.result);
    });
    const events = await new Promise<Array<{ activity: string; outcome: string; source: string }>>((resolve) => {
      const req = db.transaction('events').objectStore('events').getAll(); req.onsuccess = () => resolve(req.result);
    });
    db.close();
    return events.filter((e) => e.activity === 'new-word' || e.activity === 'sentence');
  });
  expect(reads.filter((e) => e.activity === 'new-word')).toHaveLength(3);
  expect(reads.filter((e) => e.activity === 'sentence')).toHaveLength(1);
  expect(reads.every((e) => e.source === 'mic' && e.outcome === 'first-try')).toBe(true);
});

test('a child can leave a stuck microphone through listen and repeat', async ({ page }, info) => {
  await stubDevices(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    class HungMic { start(): void {} abort(): void {} }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = HungMic;
  });
  await setUpPlayer(page, '', true);
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await playIndependently(page, '', () => page.locator('.mic:not(:disabled)').isVisible());
  await page.locator('.mic').click();
  await page.waitForTimeout(400); // actual recognition start follows the audio teardown delay
  await expect(page.locator('.mic.listening')).toBeVisible();
  await page.getByRole('button', { name: '👂 Listen & repeat', exact: true }).click();
  await expect(page.locator('.practice-next')).toBeVisible();
  await shot(page, 'independent-repeat', info.project.name);
  await page.getByRole('button', { name: 'Goal Reader', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Sam!' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('.mic')).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function practiceTopic(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: /Practice a skill/ }).click();
  const button = page.getByRole('button', { name: /mantenga presionado|press and hold/i });
  const box = await button.boundingBox();
  if (!box) throw new Error('no practice gate');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1700); await page.mouse.up();
  await page.locator('.practice input[type=checkbox]').first().uncheck();
  await page.locator('.topic-card').filter({ hasText: title }).click();
}

async function practiceEvents(page: Page): Promise<Array<{ activity: string; itemId: string; outcome: string }>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('goal-reader'); request.onsuccess = () => resolve(request.result);
    });
    const events = await new Promise<Array<{ activity: string; itemId: string; outcome: string }>>((resolve) => {
      const request = db.transaction('events').objectStore('events').getAll(); request.onsuccess = () => resolve(request.result);
    });
    db.close(); return events;
  });
}

test('Story Time reads sentence by sentence, skips parts without grading, and opens settings', async ({ page }, info) => {
  await stubDevices(page);
  await setUpPlayer(page);
  await practiceTopic(page, 'Story time');
  await page.locator('.sheet .unit-btn').first().click();
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await expect(page.locator('.tag')).toContainText('Sentence 1 of');
  await expect(page.locator('.mic, .grownup-q')).toHaveCount(0);
  await page.locator('.read-continue').click();
  await expect(page.locator('.tag')).toContainText('Sentence 2 of');
  await page.locator('.skip-part').click();
  await expect(page.locator('.tag')).toContainText('Sentence 3 of');
  await page.getByRole('button', { name: 'Skip to questions', exact: true }).click();
  await expect(page.locator('.tag')).toContainText('Question 1 of');
  await page.locator('.skip-part').click();
  await expect(page.locator('.tag')).toContainText('Question 2 of');
  const events = await practiceEvents(page);
  expect(events.filter((e) => e.activity === 'sentence')).toHaveLength(1);
  expect(events[0]?.outcome).toBe('unverified');
  expect(events.filter((e) => e.activity === 'story-question')).toHaveLength(0);
  await shot(page, 'story-skip', info.project.name);
  await page.getByRole('button', { name: 'Settings / Ajustes' }).click();
  await passGate(page);
  await expect(page.getByRole('tab', { name: 'Ajustes' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Voz de lectura' })).toHaveValue('teacher');
  await expect(page.locator('input[name=storyReading][value=sentences]')).toBeChecked();
});

test('a correct new word is saved once and does not require three readings', async ({ page }) => {
  await stubDevices(page);
  await setUpPlayer(page, '?mic=denied');
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.locator('.howto').waitFor();
  await page.locator('.skip-section').click(); // whole warmup group
  await expect(page.locator('.howto h2')).toHaveText('New word');
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await page.locator('.mic.rec').click();
  await page.getByRole('button', { name: /Read it right/ }).click();
  await expect(page.locator('.read-continue')).toBeVisible();
  const before = await practiceEvents(page);
  expect(before.filter((e) => e.activity === 'new-word')).toHaveLength(1);
  expect(before.find((e) => e.activity === 'new-word')?.outcome).toBe('first-try');
  await page.locator('.skip-section').click(); // no repeat and skip remaining new words
  await expect(page.locator('.howto h2')).not.toHaveText('New word');
  const after = await practiceEvents(page);
  expect(after.filter((e) => e.activity === 'new-word')).toEqual(before.filter((e) => e.activity === 'new-word'));
});

test('skipping an active microphone round ignores its late answer', async ({ page }) => {
  await stubDevices(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    class LateMic {
      onresult: ((e: unknown) => void) | null = null;
      start(): void { setTimeout(() => this.onresult?.({ resultIndex: 0, results: [
        { 0: { transcript: 'cat', confidence: 1 }, length: 1, isFinal: true },
      ] }), 1200); }
      abort(): void { /* Deliberately delivers after abort to test the race. */ }
    }
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = LateMic;
  });
  await setUpPlayer(page, '', true);
  await practiceTopic(page, 'Robot talk');
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await page.locator('.mic').click();
  await page.waitForTimeout(400);
  await page.locator('.skip-part').click();
  await expect(page.locator('.tag')).toContainText('Robot talk 2 of');
  await page.waitForTimeout(1400);
  expect((await practiceEvents(page)).filter((e) => e.activity === 'warmup')).toHaveLength(0);
  await page.locator('.skip-section').click();
  await expect(page.getByRole('heading', { name: 'Full time!' })).toBeVisible();
  expect((await practiceEvents(page)).filter((e) => e.activity === 'warmup')).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('skipping a recording releases the microphone without grading the word', async ({ page }) => {
  await stubDevices(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.assign(window, { stoppedRecordings: 0 });
    const original = MediaRecorder.prototype.stop;
    MediaRecorder.prototype.stop = function () {
      const probe = window as unknown as { stoppedRecordings: number };
      probe.stoppedRecordings++;
      original.call(this);
    };
  });
  await setUpPlayer(page);
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.getByRole('button', { name: /Kick off!/ }).click();
  await page.locator('.howto').waitFor();
  await page.locator('.skip-section').click();
  await page.getByRole('button', { name: /Let’s go/ }).click();
  await page.locator('.mic.rec').click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.locator('.skip-part').click();
  await expect(page.locator('.kick-label')).toContainText('2 of 3');
  await expect(page.locator('.mic.rec')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { stoppedRecordings: number }).stoppedRecordings)).toBe(1);
  expect((await practiceEvents(page)).filter((e) => e.activity === 'new-word')).toHaveLength(0);
  expect(errors).toEqual([]);
});
