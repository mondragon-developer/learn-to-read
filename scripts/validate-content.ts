/**
 * Content gate. Run: npm run validate  (vite-node, so it shares the app's TypeScript rules).
 * Fails on anything a child would trip over: undecodable sentences, wrong segmentations,
 * missing heart words, broken questions, or pictures that could cue a word before it is read.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Decodability, spell, tokenize } from '../src/domain/content/Decodability';
import { JsonContentSource } from '../src/domain/content/JsonContentSource';
import type { HeartWord, Story, Unit } from '../src/domain/content/types';
import benchmarksFile from '../src/data/benchmarks.json';

const errors: string[] = [];
const warnings: string[] = [];
const err = (where: string, msg: string): void => { errors.push(`✗ ${where}: ${msg}`); };
const warn = (where: string, msg: string): void => { warnings.push(`! ${where}: ${msg}`); };

const source = new JsonContentSource();
const units: Unit[] = [...source.units()].sort((a, b) => a.order - b.order);
const heart: HeartWord[] = source.heartWords();
const stories: Story[] = source.stories();
const dec = new Decodability(units, heart);
const benchmarkCodes = new Set(benchmarksFile.benchmarks.map((b) => b.code));

// ---- units ----
const seenCards = new Map<string, string>();
const heartTexts = new Set(heart.map((h) => h.text.toLowerCase()));
units.forEach((u, i) => {
  const at = u.id;
  if (u.order !== i + 1) err(at, `order ${u.order} breaks the 1..n sequence`);
  if (u.id !== `u${String(u.order).padStart(2, '0')}`) err(at, 'id must be u + zero-padded order');
  if (u.words.length < 8 || u.words.length > 12) warn(at, `${u.words.length} card words (plan: 8–12)`);
  for (const w of [...u.words, ...(u.extras ?? [])]) {
    const text = w.text.toLowerCase();
    if (spell(w.graphemes) !== text) err(at, `"${w.text}" graphemes [${w.graphemes.join(',')}] spell "${spell(w.graphemes)}"`);
    else if (!dec.isDecodable(w, u.order)) err(at, `"${w.text}" uses graphemes not taught by unit ${u.order}`);
    if (heartTexts.has(text)) err(at, `"${w.text}" is a heart word; it cannot also be a decodable word`);
  }
  for (const w of u.words) {
    const key = w.text.toLowerCase();
    const prev = seenCards.get(key);
    if (prev) err(at, `card "${w.text}" already taught in ${prev}`);
    seenCards.set(key, u.id);
  }
  for (const t of u.heartWords) {
    const h = heart.find((x) => x.text.toLowerCase() === t.toLowerCase());
    if (!h) err(at, `heart word "${t}" missing from heartwords.json`);
    else if (h.unit !== u.order) err(at, `heart word "${t}" is unit ${h.unit} in heartwords.json`);
  }
  u.sentences.forEach((s, k) => {
    const r = dec.checkSentence(s, u.order);
    if (!r.ok) err(`${at} sentence ${k}`, `"${s}" has undecodable words: ${r.unknown.join(', ')}`);
  });
  const lexicon = dec.wordsThrough(u.order);
  for (const fam of u.rhymes) {
    const rime = (w: string) => w.slice(-2);
    for (const w of fam) {
      if (!lexicon.has(w.toLowerCase())) err(at, `rhyme word "${w}" is not a word or extra through unit ${u.order}`);
      if (rime(w) !== rime(fam[0] as string)) err(at, `"${w}" does not rhyme with "${fam[0]}"`);
    }
  }
  for (const [a, b] of u.contrasts) {
    for (const w of [a, b]) if (!lexicon.has(w.toLowerCase())) err(at, `contrast word "${w}" is not a word or extra through unit ${u.order}`);
    if (a === b) err(at, `contrast pair "${a}" repeats the same word`);
  }
  for (const code of u.benchmarks) if (!benchmarkCodes.has(code)) err(at, `unknown benchmark ${code}`);
});
for (const h of heart) {
  const u = units.find((x) => x.order === h.unit);
  if (u && !u.heartWords.some((t) => t.toLowerCase() === h.text.toLowerCase())) err('heartwords.json', `"${h.text}" (unit ${h.unit}) not listed in ${u.id}.heartWords`);
  if (h.heartPart && !h.text.toLowerCase().includes(h.heartPart.toLowerCase())) err('heartwords.json', `"${h.text}" heartPart "${h.heartPart}" is not part of the word`);
}

// ---- challenge words ----
{
  const seen = new Set<string>();
  for (const c of source.challengeWords()) {
    const at = `challenge "${c.text}"`;
    const key = c.text.toLowerCase();
    if (seen.has(key)) err(at, 'duplicate');
    seen.add(key);
    if (c.syllables.join('') !== key) err(at, `syllables [${c.syllables.join('·')}] do not spell the word`);
    if (seenCards.has(key)) err(at, `already a card in ${seenCards.get(key)}`);
    if (heartTexts.has(key)) err(at, 'already a heart word');
  }
}

// ---- stories ----
const storyIds = new Set<string>();
for (const s of stories) {
  const at = s.id;
  if (storyIds.has(s.id)) err(at, 'duplicate id');
  storyIds.add(s.id);
  if (s.tier === 'decodable') {
    s.sentences.forEach((line, k) => {
      const r = dec.checkSentence(line, s.unit);
      if (!r.ok) err(`${at} sentence ${k}`, `"${line}" not decodable at unit ${s.unit}: ${r.unknown.join(', ')}`);
    });
  } else {
    if (s.sentences.length > 10) err(at, `${s.sentences.length} sentences (max 10 for a read-along)`);
    s.sentences.forEach((line, k) => { if (tokenize(line).length > 12) warn(`${at} sentence ${k}`, 'over 12 words'); });
  }
  if (s.questions.length !== 3) err(at, 'needs exactly 3 questions');
  s.questions.forEach((q, k) => {
    if (q.options.length !== 3) err(`${at} q${k}`, 'needs 3 options');
    if (q.answer < 0 || q.answer > 2) err(`${at} q${k}`, 'answer out of range');
    if (new Set(q.options).size !== q.options.length) err(`${at} q${k}`, 'duplicate options');
  });
  if (new Set(s.questions.map((q) => q.answer)).size === 1) warn(at, 'every answer is in the same position');
  if (s.bonus.answer < 0 || s.bonus.answer >= s.bonus.options.length) err(at, 'bonus answer out of range');
  const [a, b, c] = s.order;
  if (!(a < b && b < c) || c >= s.sentences.length) err(at, 'order must be 3 ascending sentence indexes');
  for (const code of s.benchmarks) if (!benchmarkCodes.has(code)) err(at, `unknown benchmark ${code}`);
}

// ---- no three-cueing: pictures only as `reward` ----
const PICTURE_KEYS = /^(image|img|picture|emoji|icon|photo|illustration)s?$/i;
function scan(file: string, node: unknown, path: string): void {
  if (Array.isArray(node)) { node.forEach((v, i) => scan(file, v, `${path}[${i}]`)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (PICTURE_KEYS.test(k)) err(file, `${path}.${k}: pictures may only appear as "reward" (shown after reading)`);
      scan(file, v, `${path}.${k}`);
    }
  }
}
for (const dir of ['units', 'stories']) {
  const full = join('src/data', dir);
  for (const f of readdirSync(full).filter((x) => x.endsWith('.json'))) scan(`${dir}/${f}`, JSON.parse(readFileSync(join(full, f), 'utf8')), '');
}

// ---- report ----
const cards = units.reduce((n, u) => n + u.words.length, 0);
console.log(`Content: ${units.length} units · ${cards} word cards · ${heart.length} heart words · ${source.challengeWords().length} challenge words · ${stories.length} stories`);
warnings.forEach((w) => console.log(w));
if (errors.length) {
  errors.forEach((e) => console.error(e));
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log('✓ content valid');
