import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { JsonContentSource } from '../src/domain/content/JsonContentSource';
import { ContentLibrary } from '../src/domain/content/ContentLibrary';
import { buildCatalog } from '../src/domain/audio/AudioCatalog';
import prompts from '../src/data/prompts.json';
import syllables from '../src/data/syllables.json';

const library = new ContentLibrary(new JsonContentSource());
const stories = library.stories.filter((s) => s.collection === 'soccer');
describe('soccer story collection', () => {
  it('offers short supported stories with sources for real players', () => {
    expect(stories.length).toBeGreaterThanOrEqual(12);
    expect(stories.filter((s) => s.genre === 'biography').map((s) => s.player)).toEqual(expect.arrayContaining(['Cristiano Ronaldo', 'Harry Kane', 'Vinícius Júnior']));
    for (const s of stories) {
      expect(s.sentences.length).toBeGreaterThanOrEqual(6);
      expect(s.sentences.length).toBeLessThan(10);
      expect(s.tier).toBe('readalong');
      if (s.genre === 'biography') expect(s.sources?.every((x) => x.url.startsWith('https://'))).toBe(true);
    }
  });
  it.each(['audio-manifest.json', 'audio-josh-manifest.json'])('%s covers the full catalog with installed recordings', (file) => {
    const manifest = JSON.parse(readFileSync(`src/data/${file}`, 'utf8')) as Record<string, { file: string }>;
    const missing = buildCatalog(library, prompts, syllables.words.map((w) => w.text))
      .filter((c) => !manifest[c.key] || !existsSync(`public/${manifest[c.key]!.file}`)).map((c) => c.key);
    expect(missing).toEqual([]);
  });
});
