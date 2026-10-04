/**
 * M1 device check. Open /spike.html on the real iPad, iPhone and Mac — once in a Safari tab and
 * once from the Home Screen icon — run each card, then tap "Copy report" and paste it back.
 * Throwaway by design: it answers "does free speech recognition work where he will practice?"
 */
import '@fontsource/andika/latin-400.css';
import '@fontsource/andika/latin-700.css';
import './spike.css';

type Json = Record<string, unknown>;
const report: Json = { startedAt: new Date().toISOString() };
const root = document.getElementById('spike') as HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function card(title: string, help: string): { box: HTMLElement; out: HTMLElement } {
  const box = el('section', 'card');
  box.append(el('h2', '', title), el('p', 'help', help));
  const out = el('pre', 'out');
  box.append(out);
  root.append(box);
  return { box, out };
}

function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}

function log(out: HTMLElement, line: string): void {
  out.textContent = `${out.textContent ?? ''}${line}\n`;
}

// ---------- 1. Environment ----------
interface SpeechRecognitionAlternativeLike { transcript: string; confidence: number }
interface SpeechRecognitionResultLike { length: number; isFinal: boolean; [i: number]: SpeechRecognitionAlternativeLike }
interface SpeechRecognitionEventLike { results: { length: number; [i: number]: SpeechRecognitionResultLike } }
interface Recognizer {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null; onstart: (() => void) | null;
  onspeechstart?: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognizerCtor = new () => Recognizer;
const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;

const env = {
  userAgent: navigator.userAgent,
  standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
  speechRecognition: Recognition ? (w.SpeechRecognition ? 'SpeechRecognition' : 'webkitSpeechRecognition') : 'missing',
  speechSynthesis: 'speechSynthesis' in window,
  audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
  pointerEvents: 'PointerEvent' in window,
  online: navigator.onLine,
  screen: `${screen.width}x${screen.height} @${devicePixelRatio}x`,
};
report.env = env;
{
  const { out } = card('1 · This device', 'What the browser says it supports.');
  out.textContent = JSON.stringify(env, null, 2);
}

// ---------- 2. Audio ----------
{
  const { box, out } = card('2 · Sound', 'Tap Play. You should hear a short beep, then a voice say "cat".');
  const row = el('div', 'row');
  row.append(button('▶ Play', () => {
    const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    void ctx.resume();
    const osc = ctx.createOscillator();
    osc.frequency.value = 660;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    const u = new SpeechSynthesisUtterance('cat');
    u.lang = 'en-US';
    u.rate = 0.8;
    setTimeout(() => speechSynthesis.speak(u), 400);
    log(out, `audioContext state: ${ctx.state} · en voices: ${voices.length} (${voices.slice(0, 4).map((v) => v.name).join(', ')})`);
    report.audioVoices = voices.map((v) => v.name);
  }));
  row.append(button('I heard both ✓', () => { report.audioHeard = true; log(out, 'heard: yes'); }, 'btn ok'));
  row.append(button('Something was missing ✗', () => { report.audioHeard = false; log(out, 'heard: no'); }, 'btn no'));
  box.insertBefore(row, out);
}

// ---------- 3. Word recognition ----------
const WORDS = ['cat', 'the', 'ship', 'sheep', 'said', 'I', 'mom', 'red', 'sun', 'big'];
const wordResults: Json[] = [];
report.words = wordResults;
{
  const { box, out } = card('3 · Say a word', 'Tap a word, wait for "listening…", then the child reads it once. Try a few on purpose wrong too (say "cut" for cat).');
  const row = el('div', 'row wrap');
  for (const word of WORDS) row.append(button(word, () => listen(word, out), 'btn word'));
  box.insertBefore(row, out);
}

function listen(target: string, out: HTMLElement, continuous = false): void {
  if (!Recognition) { log(out, '✗ SpeechRecognition is not available here'); return; }
  const r = new Recognition();
  r.lang = 'en-US';
  r.continuous = continuous;
  r.interimResults = false;
  r.maxAlternatives = 5;
  const t0 = performance.now();
  const entry: Json = { target, standalone: env.standalone };
  r.onstart = () => log(out, `listening for "${target}"…`);
  r.onresult = (e) => {
    const alts: string[] = [];
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res) continue;
      for (let j = 0; j < res.length; j++) {
        const a = res[j];
        if (a) alts.push(`${a.transcript.trim()} (${a.confidence.toFixed(2)})`);
      }
    }
    entry.alternatives = alts;
    entry.ms = Math.round(performance.now() - t0);
    log(out, `heard: ${alts.join(' | ') || '(nothing)'} · ${entry.ms as number} ms`);
  };
  r.onerror = (e) => { entry.error = e.error; log(out, `✗ error: ${e.error}${e.message ? ` — ${e.message}` : ''}`); };
  r.onend = () => { entry.endedAfterMs = Math.round(performance.now() - t0); wordResults.push(entry); log(out, '— done'); };
  try { r.start(); } catch (err) { log(out, `✗ start failed: ${String(err)}`); }
}

// ---------- 3b. Listen right after audio (known iOS 27 hang) ----------
{
  const { box, out } = card('3b · Hear it, then say it', 'This is the real app flow: the voice says the word, then the mic opens. If nothing happens for 8 seconds, it hung.');
  const row = el('div', 'row wrap');
  for (const word of ['cat', 'ship', 'the']) {
    row.append(button(`🔊 ${word}`, () => {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = 0.8;
      u.onend = () => {
        const t0 = performance.now();
        listen(word, out);
        setTimeout(() => {
          const last = wordResults.at(-1);
          if (!last || last.target !== word || (last.endedAfterMs as number | undefined) === undefined) {
            log(out, `⚠ no result after ${Math.round(performance.now() - t0)} ms — recognition hung after audio`);
            wordResults.push({ target: word, afterAudio: true, hung: true });
          }
        }, 8000);
      };
      speechSynthesis.speak(u);
    }, 'btn word'));
  }
  box.insertBefore(row, out);
}

// ---------- 3c. Record and play back (the "I only hear the app" check) ----------
{
  const { box, out } = card('3c · Record and hear yourself', 'Tap Record, say "cat", wait. You should hear yourself. The report says what was captured.');
  const recLog: Json[] = [];
  report.recordings = recLog;
  box.insertBefore(button('🎙 Record 3 s', () => void (async () => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const entry: Json = { audioSession: (navigator as { audioSession?: { type: string } }).audioSession?.type ?? 'n/a' };
    try {
      const session = (navigator as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'play-and-record';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
      rec.start(250);
      log(out, `recording… (${rec.mimeType || mimeType || 'default type'})`);
      await new Promise((r) => setTimeout(r, 3000));
      rec.stop();
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      if (session) session.type = 'playback';
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || '' });
      Object.assign(entry, { type: blob.type, bytes: blob.size, chunks: chunks.length });
      try {
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        let peak = 0;
        for (const v of buf.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
        Object.assign(entry, { decoded: true, seconds: +buf.duration.toFixed(2), peak: +peak.toFixed(3) });
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
        await new Promise((r) => { src.onended = r; });
      } catch (e) {
        entry.decoded = false;
        entry.decodeError = String(e);
        const a = new Audio(URL.createObjectURL(blob));
        await a.play().then(() => new Promise((r) => { a.onended = r; })).catch((err: unknown) => { entry.elementError = String(err); });
      }
    } catch (e) {
      entry.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    recLog.push(entry);
    log(out, JSON.stringify(entry));
  })()), out);
  box.insertBefore(button('I heard myself ✓', () => { report.heardSelf = true; log(out, 'heard self: yes'); }, 'btn ok'), out);
  box.insertBefore(button('Silent ✗', () => { report.heardSelf = false; log(out, 'heard self: no'); }, 'btn no'), out);
}

// ---------- 4. Sentence ----------
{
  const { box, out } = card('4 · Read a sentence', 'Tap, then read: "The cat sat on a mat." Then tap Stop.');
  const sentenceLog: Json[] = [];
  report.sentence = sentenceLog;
  let current: Recognizer | null = null;
  const row = el('div', 'row');
  row.append(button('🎤 Start', () => {
    if (!Recognition) { log(out, '✗ not available'); return; }
    const r = new Recognition();
    current = r;
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    const t0 = performance.now();
    r.onstart = () => log(out, 'listening…');
    r.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const a = res?.[0];
        if (res && a) parts.push(`${res.isFinal ? '■' : '□'} ${a.transcript.trim()}`);
      }
      log(out, parts.join(' '));
      sentenceLog.push({ ms: Math.round(performance.now() - t0), parts });
    };
    r.onerror = (e) => log(out, `✗ error: ${e.error}`);
    r.onend = () => log(out, `— ended after ${Math.round(performance.now() - t0)} ms`);
    r.start();
  }));
  row.append(button('■ Stop', () => current?.stop()));
  box.insertBefore(row, out);
}

// ---------- 5. Writing canvas ----------
{
  const { box, out } = card('5 · Write', 'Write "cat" with a finger, then with the Apple Pencil.');
  const canvas = el('canvas', 'pad');
  box.insertBefore(canvas, out);
  const stats = { strokes: 0, points: 0, types: new Set<string>(), maxPressure: 0, coalescedMax: 0 };
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const fit = (): void => {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1F7A4D';
  };
  requestAnimationFrame(fit);
  let drawing = false;
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    stats.strokes++;
    stats.types.add(e.pointerType);
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const pts = e.getCoalescedEvents?.() ?? [e];
    stats.coalescedMax = Math.max(stats.coalescedMax, pts.length);
    for (const p of pts) { ctx.lineTo(p.offsetX, p.offsetY); stats.points++; stats.maxPressure = Math.max(stats.maxPressure, p.pressure); }
    ctx.stroke();
  });
  const end = (): void => {
    drawing = false;
    report.canvas = { ...stats, types: [...stats.types] };
    out.textContent = JSON.stringify(report.canvas);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  box.insertBefore(button('Clear', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); }), out);
}

// ---------- Report ----------
{
  const { box, out } = card('6 · Send the report', 'Tap Copy, then paste it into the chat with Claude.');
  box.insertBefore(button('📋 Copy report', () => {
    report.finishedAt = new Date().toISOString();
    const text = JSON.stringify(report, null, 2);
    out.textContent = text;
    void navigator.clipboard?.writeText(text).then(() => log(out, '\n✓ copied'), () => log(out, '\n(select the text above and copy it by hand)'));
  }, 'btn ok'), out);
}
