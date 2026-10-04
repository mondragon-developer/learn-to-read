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
