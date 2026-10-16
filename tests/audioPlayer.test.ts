import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebAudioPlayer } from '../src/platform/WebAudioPlayer';
import { AudioEngine } from '../src/platform/AudioEngine';
import type { Clip } from '../src/domain/audio/AudioCatalog';

/** Device-voice stand-in: records what was spoken, finishes each utterance shortly after. */
let spoken: string[] = [];
beforeEach(() => {
  spoken = [];
  const g = globalThis as Record<string, unknown>;
  g.SpeechSynthesisUtterance = class { onend: (() => void) | null = null; onerror: (() => void) | null = null; onboundary = null; lang = ''; rate = 1; voice = null; constructor(public text: string) {} };
  g.speechSynthesis = {
    speak: (u: { text: string; onend: (() => void) | null }) => { spoken.push(u.text); setTimeout(() => u.onend?.(), 5); },
    cancel: () => undefined,
    getVoices: () => [],
  };
});
afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.speechSynthesis;
  delete g.SpeechSynthesisUtterance;
});

const clip = (key: string, text: string): Clip => ({ key, kind: 'word', text, ttsText: text, file: `audio/${text}.mp3`, speed: 1 });
const player = (): WebAudioPlayer => new WebAudioPlayer(new AudioEngine(), [clip('prompt:rhyme-with', 'Which one rhymes with'), clip('word:cat', 'cat'), clip('word:hat', 'hat')], new Set());

describe('WebAudioPlayer.sequence', () => {
  it('plays every clip in order (regression: it used to stop after the first)', async () => {
    await player().sequence(['prompt:rhyme-with', 'word:cat', 'word:hat'], 0);
    expect(spoken).toEqual(['Which one rhymes with', 'cat', 'hat']);
  });

  it('stop() from outside ends the sequence', async () => {
    const p = player();
    const run = p.sequence(['prompt:rhyme-with', 'word:cat', 'word:hat'], 20);
    await new Promise((r) => setTimeout(r, 10));
    p.stop();
    await run;
    expect(spoken).toEqual(['Which one rhymes with']);
  });
});

describe('Fish voice selection', () => {
  it('switches recordings without reusing the other voice’s decoded buffer', async () => {
    const { vi } = await import('vitest');
    const fetched: string[] = [];
    const played: number[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => new Uint8Array([url.includes('josh') ? 2 : 1]).buffer };
    });
    const engine = {
      context: { decodeAudioData: async (data: ArrayBuffer) => ({ duration: new Uint8Array(data)[0] }) },
      play: async (buffer: AudioBuffer) => { played.push(buffer.duration); },
    } as unknown as AudioEngine;
    const teacher = clip('word:cat', 'cat');
    const josh = { ...teacher, file: 'audio/cat-josh.mp3' };
    try {
      const p = new WebAudioPlayer(engine, [teacher], new Set(['word:cat']), '/', {
        josh: { label: 'Josh — Fish Audio', catalog: [josh], available: new Set(['word:cat']) },
      });
      await p.play('word:cat');
      p.selectVoice('josh'); await p.play('word:cat');
      p.selectVoice('teacher'); await p.play('word:cat');
      expect(played).toEqual([1, 2, 1]);
      expect(fetched).toEqual(['/audio/cat.mp3', '/audio/cat-josh.mp3']);
      expect(spoken).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  });

  it('falls back to Teacher when a saved device voice is not installed here', async () => {
    const { vi } = await import('vitest');
    const played: number[] = [];
    vi.stubGlobal('fetch', async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
    const engine = { context: { decodeAudioData: async () => ({ duration: 1 }) }, play: async (buffer: AudioBuffer) => { played.push(buffer.duration); } } as unknown as AudioEngine;
    try {
      const p = new WebAudioPlayer(engine, [clip('word:cat', 'cat')], new Set(['word:cat']), '/');
      p.selectVoice('device:missing-on-this-ipad');
      await p.play('word:cat');
      expect(played).toEqual([1]);
      expect(spoken).toEqual([]);
    } finally { vi.unstubAllGlobals(); }
  });
});
