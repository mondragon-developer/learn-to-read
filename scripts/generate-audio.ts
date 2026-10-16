/**
 * Generates every MP3 the app needs with the Fish Audio API (build-time only; the key never ships).
 *
 *   npm run audio -- --dry            list what is missing, characters and estimated cost
 *   npm run audio                     generate missing/changed clips
 *   npm run audio -- --only=sound     one kind: word | sound | sentence | story | prompt
 *   npm run audio -- --redo=sound:a   regenerate ONLY these keys (comma separated)
 *   npm run audio -- --only=prompt --limit=5   generate a small voice preview
 *   npm run audio -- --export=/tmp/voice-plan.json   export a plan without API calls
 *
 * Needs FISH_API_KEY and FISH_VOICE_ID in .env.local. A clip is regenerated only when its text,
 * voice, model or speed changed (hash in src/data/audio-manifest.json).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { JsonContentSource } from '../src/domain/content/JsonContentSource';
import { buildCatalog, type Clip } from '../src/domain/audio/AudioCatalog';
import prompts from '../src/data/prompts.json';
import syllables from '../src/data/syllables.json';

const MANIFEST = 'src/data/audio-manifest.json';
const MODEL = 's2.1-pro';
const CONCURRENCY = 3;               // Starter tier allows 5 concurrent requests
const USD_PER_MILLION_BYTES = 15;    // docs.fish.audio pricing, checked 2026-10-04

function loadEnv(): void {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1] as string]) process.env[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, '');
    }
  }
}

type Manifest = Record<string, { file: string; hash: string }>;

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k as string, v ?? 'true']; }));
loadEnv();
const key = process.env.FISH_API_KEY ?? '';
const voice = process.env.FISH_VOICE_ID ?? '';
const dry = args.has('dry') || !key;

const catalog = buildCatalog(new ContentLibrary(new JsonContentSource()), prompts, syllables.words.map((w) => w.text));
const manifest: Manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest : {};
const hashOf = (c: Clip): string => createHash('sha1').update(JSON.stringify([c.ttsText, c.speed, voice, MODEL])).digest('hex').slice(0, 12);

const only = args.get('only');
const redo = new Set((args.get('redo') ?? '').split(',').filter(Boolean));
const limit = Number(args.get('limit') ?? catalog.length);
if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer.');
if (only && !catalog.some((c) => c.kind === only)) throw new Error(`Unknown clip kind: ${only}`);
for (const k of redo) if (!catalog.some((c) => c.key === k)) throw new Error(`Unknown clip key: ${k}`);
const todo = catalog.filter((c) => {
  if (only && c.kind !== only) return false;
  if (redo.size) return redo.has(c.key);
  const m = manifest[c.key];
  return !m || m.hash !== hashOf(c) || !existsSync(join('public', c.file));
}).slice(0, limit);

const bytes = todo.reduce((n, c) => n + Buffer.byteLength(c.ttsText, 'utf8'), 0);
console.log(`${catalog.length} clips in catalog · ${todo.length} to generate · ${bytes} bytes of text ≈ $${((bytes / 1e6) * USD_PER_MILLION_BYTES).toFixed(2)}`);
const byKind = todo.reduce<Record<string, number>>((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {});
console.log('by kind:', byKind);
console.log('Billing: developer API balance; website plan credits are separate. Replays of saved MP3s cost nothing.');
if (args.has('export')) {
  const out = args.get('export') as string;
  if (out === 'true') throw new Error('Use --export=/path/to/voice-plan.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ model: MODEL, voice: voice || null, bytes, clips: todo.map((c) => ({ ...c, hash: hashOf(c) })) }, null, 2)}\n`);
  console.log(`Exported ${todo.length} clips to ${out}. No audio requested or credits spent.`);
  process.exit(0);
}

if (dry) {
  if (!key) console.log('\nNo FISH_API_KEY in .env.local - dry run only. The app falls back to the device voice for missing clips.');
  process.exit(0);
}
if (!voice) throw new Error('Set FISH_VOICE_ID in .env.local so every clip uses the chosen voice.');

async function tts(c: Clip, attempt = 1): Promise<Buffer> {
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: MODEL },
    body: JSON.stringify({
      text: c.ttsText,
      ...(voice ? { reference_id: voice } : {}),
      format: 'mp3', mp3_bitrate: 64, sample_rate: 44100, latency: 'normal', normalize: true,
      prosody: { speed: c.speed, volume: 0 },
    }),
  });
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return tts(c, attempt + 1);
  }
  if (!res.ok) {
    // A bad key or empty API balance cannot be fixed by trying hundreds more clips.
    if ([401, 402, 403].includes(res.status)) queue.length = 0;
    throw new Error(`Fish Audio returned HTTP ${res.status}. Check API access, balance, and voice ID.`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  if (!audio.length) throw new Error('Fish Audio returned an empty clip.');
  return audio;
}

let done = 0;
let failed = 0;
const queue = [...todo];
async function worker(): Promise<void> {
  for (let c = queue.shift(); c; c = queue.shift()) {
    try {
      const audio = await tts(c);
      const out = join('public', c.file);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, audio);
      manifest[c.key] = { file: c.file, hash: hashOf(c) };
      done++;
      if (done % 20 === 0) writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 1)}\n`);
      process.stdout.write(`\r${done}/${todo.length} ${c.key.padEnd(30)}`);
    } catch (e) {
      failed++;
      console.error(`\n✗ ${c.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`\n✓ ${done} generated · ${failed} failed · manifest ${MANIFEST}`);
if (failed) process.exit(1);
