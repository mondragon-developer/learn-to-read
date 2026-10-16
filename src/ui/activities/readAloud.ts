import { IndependentReader } from './independentRead';
import { outcomeFor } from '@domain/speech/Grading';
import type { AnswerMatcher, MatchLevel } from '@domain/speech/AnswerMatcher';
import type { SentenceMatch, SentenceMatcher } from '@domain/speech/SentenceMatcher';
import { MicHealth, type PronunciationChecker } from '@domain/speech/PronunciationChecker';
import type { Take, VoiceRecorder } from '@domain/audio/VoiceRecorder';
import type { I18n } from '@domain/i18n/i18n';
import type { Outcome, Source } from '@domain/storage/events';
import { h, replace, sleep } from '../dom';
import { playTake, recordTake } from './takeUi';

export interface ReadResult { outcome: Outcome; source: Source; heard: string; hint?: string }

/** One sentence attempt. `match` is null when a grown-up judged it (no word-level detail). */
export interface SentenceRead { pass: boolean; match: SentenceMatch | null; source: Source; unverified?: boolean }

/** The audio cues the read-aloud loop needs. */
export interface Voice {
  prompt(id: string): Promise<void>;
  word(text: string): Promise<void>;
}

/** How reads are checked right now. */
export type CheckMode = 'mic' | 'record' | 'buttons';

const MAX_SILENCES = 3;
const WORD_TAKE_MS = 4000;
const SENTENCE_TAKE_MS = 14000;

/**
 * "Read it out loud", three ways:
 *  - record (default): he records, hears himself, hears the model; the grown-up taps ✓.
 *  - mic: free speech recognition grades it (two hangs in a row fall back to record/buttons).
 *  - buttons: no recorder on this device; the grown-up listens live and taps ✓.
 * Never says "wrong": a miss ends with the model and "now you".
 */
export class ReadAloud {
  readonly health = new MicHealth();
  private recorderBroken = false;
  readonly independentReader: IndependentReader | null;

  constructor(
    private readonly voice: Voice,
    private readonly checker: PronunciationChecker,
    private readonly recorder: VoiceRecorder,
    private readonly words: AnswerMatcher,
    private readonly sentences: SentenceMatcher,
    private readonly i18n: I18n,
    preferMic: boolean,
    independent = false,
    signal: AbortSignal = new AbortController().signal,
    stopVoice: () => void = () => undefined,
  ) {
    this.independentReader = independent ? new IndependentReader(voice, checker, words, sentences, signal, stopVoice) : null;
    if (!preferMic || !checker.available) this.health.record('unavailable');
  }

  get mode(): CheckMode {
    if (!this.health.useGrownUpCheck) return 'mic';
    return this.recorder.available && !this.recorderBroken ? 'record' : 'buttons';
  }

  /** True when a grown-up is judging (record or buttons). */
  get grownUpMode(): boolean { return !this.independentReader && this.mode !== 'mic'; }

  /** Two tries for one word inside `panel`. */
  async readWord(panel: HTMLElement, target: string, label = 'Read it!'): Promise<ReadResult> {
    if (this.independentReader) return this.independentReader.readWord(panel, target, label);
    const levels: MatchLevel[] = [];
    let heard = '';
    let hint: string | undefined;
    let silences = 0;
    while (levels.length < 2) {
      if (this.mode !== 'mic' || silences >= MAX_SILENCES) return this.grownUpWord(panel, target, levels.length > 0, label);
      await micButton(panel, levels.length ? 'Try again!' : label);
      const res = await this.checker.listen({ expected: target, mode: 'word' });
      this.health.record(res.status);
      if (res.status === 'silence') {
        silences++;
        replace(panel, h('p', { class: 'coach' }, 'I didn’t hear you. Tap the mic and read it loud!'));
        await sleep(900);
        continue;
      }
      if (res.status !== 'heard') continue; // hung/error: the loop re-checks the mode
      const m = this.words.matchWord(target, res.alternatives);
      heard = m.heard;
      levels.push(m.level);
      if (m.level === 'match') break;
      replace(panel, h('p', { class: 'coach' }, m.level === 'close' ? 'So close! Listen…' : 'Listen…'));
      await this.voice.prompt(m.level === 'close' ? 'so-close' : 'listen');
      await this.voice.word(target);
      if (m.level === 'close') { hint = m.hint; break; }
      if (levels.length < 2) await this.voice.prompt('now-you');
    }
    return { outcome: outcomeFor(levels), source: 'mic', heard, hint };
  }

  /**
   * One attempt at a sentence. `model` plays the correct reading (with word pointing).
   * Mic failures retry silently; the caller decides about a second attempt.
   */
  async readSentence(panel: HTMLElement, text: string, model: () => Promise<void>, label = 'Read it!'): Promise<SentenceRead> {
    if (this.independentReader) return this.independentReader.readSentence(panel, text, model, label);
    let silences = 0;
    for (;;) {
      if (this.mode !== 'mic' || silences >= MAX_SILENCES) {
        const ok = await this.grownUpJudge(panel, model, SENTENCE_TAKE_MS, label, 'Grown-up: did it sound like the story?', '✓ Yes', '↺ Mostly not');
        return { pass: ok === 'yes', match: null, source: 'grownup' };
      }
      await micButton(panel, label);
      const res = await this.checker.listen({ expected: text, mode: 'sentence' });
      this.health.record(res.status);
      if (res.status === 'silence') { silences++; continue; }
      if (res.status !== 'heard') continue;
      const match = this.sentences.matchBest(text, res.alternatives);
      return { pass: match.pass, match, source: 'mic' };
    }
  }

  /** A grown-up decides, after hearing the child's recording next to the model (record mode). */
  private async grownUpWord(panel: HTMLElement, target: string, alreadyTried: boolean, label: string): Promise<ReadResult> {
    const model = (): Promise<void> => this.voice.word(target);
    const source: Source = 'grownup';
    const first = await this.grownUpJudge(panel, model, WORD_TAKE_MS, label, 'Grown-up: did it sound the same?', '✓ Read it right', '↺ Try again');
    if (first === 'yes') return { outcome: alreadyTried ? 'after-retry' : 'first-try', source, heard: '' };
    replace(panel, h('p', { class: 'coach' }, 'Listen…'));
    await this.voice.prompt('listen');
    await model();
    await this.voice.prompt('now-you');
    const second = await this.grownUpJudge(panel, model, WORD_TAKE_MS, 'Say it again!', 'Grown-up: did it sound the same?', '✓ Read it right', '↺ Needs more practice');
    return { outcome: second === 'yes' ? 'after-retry' : 'missed', source, heard: '' };
  }

  /**
   * Record mode: 🎙 record → his voice (with "🎙 Recorded 1.8 s") → the model → grown-up ✓ / try again.
   * If the take can't be heard, the grown-up sees why and still judges what they heard live.
   * Buttons mode: he reads live, the grown-up taps.
   */
  private async grownUpJudge(panel: HTMLElement, model: () => Promise<void>, maxMs: number, label: string, question: string, yes: string, no: string): Promise<'yes' | 'no'> {
    let take: Take | null = null;
    let playable = false;
    const note = h('div', { class: 'rec-note' });
    if (this.mode === 'record') {
      const r = await recordTake(this.recorder, this.i18n, panel, label, maxMs);
      if ('error' in r) {
        replace(note, h('p', { class: 'rec-badge warn', role: 'alert' }, `⚠️ ${r.message}`));
        // Blocked, missing or unsupported mic won't fix itself this session: stop asking to record.
        if (r.error !== 'busy' && r.error !== 'unknown') this.recorderBroken = true;
      } else {
        take = r.take;
        replace(panel, h('p', { class: 'coach' }, '👂 You said…'), note);
        playable = (await playTake(this.recorder, this.i18n, take, (b) => replace(note, b))).ok;
        replace(panel, h('p', { class: 'coach' }, '🔊 It sounds like…'), note);
        await model();
      }
    }
    return new Promise((resolve) => {
      const replay = take && playable
        ? h('button', { class: 'btn soft', onClick: async () => {
          if (take) await playTake(this.recorder, this.i18n, take, (b) => replace(note, b));
          await model();
        } }, '▶ Hear both again')
        : h('button', { class: 'btn link', onClick: () => void model() }, '🔊 Hear how it sounds');
      replace(panel,
        h('p', { class: 'coach small grownup-q' }, take ? question : `Read it out loud! ${question}`),
        h('div', { class: 'row center' },
          h('button', { class: 'btn big ok', onClick: () => resolve('yes') }, yes),
          h('button', { class: 'btn big soft', onClick: () => resolve('no') }, no)),
        replay, note);
    });
  }
}

/** Big pulsing mic; resolves on tap and turns into the "listening" state. */
function micButton(panel: HTMLElement, label: string): Promise<void> {
  return new Promise((resolve) => {
    const btn = h('button', { class: 'mic pulse', 'aria-label': label, onClick: () => {
      replace(panel, h('div', { class: 'mic listening' }, h('span', { class: 'mic-icon', 'aria-hidden': 'true' }, '🎤'), h('span', {}, 'Listening…')));
      resolve();
    } }, h('span', { class: 'mic-icon', 'aria-hidden': 'true' }, '🎤'), h('span', {}, label));
    replace(panel, btn);
  });
}

/** Colors each word button green/red from a sentence match; punctuation-only tokens are skipped. */
export function paintHits(wordButtons: HTMLElement[], match: SentenceMatch): void {
  let w = 0;
  for (const el of wordButtons) {
    if (!/[A-Za-z]/.test(el.textContent ?? '')) continue;
    el.classList.toggle('hit', !!match.hits[w]);
    el.classList.toggle('miss', !match.hits[w]);
    w++;
  }
}

/**
 * Plays a model sentence while pointing at each word button (yellow + 👆).
 * pace 'word': one word clip at a time (slow, exact). pace 'follow': the sentence clip, natural pace.
 * `stopped` lets a pause/replay cut a word-by-word reading between words.
 */
export async function pointAndRead(
  play: { follow(key: string, words: string[], onWord: (i: number) => void): Promise<void>; word(text: string): Promise<void> },
  buttons: HTMLElement[], sentenceKey: string, pace: 'word' | 'follow', stopped: () => boolean = () => false,
): Promise<void> {
  const mark = (i: number): void => buttons.forEach((b, j) => b.classList.toggle('speaking', j === i));
  if (pace === 'word') {
    for (let i = 0; i < buttons.length; i++) {
      if (stopped()) break;
      const text = (buttons[i]?.textContent ?? '').replace(/[^A-Za-z']/g, '');
      if (!text) continue;
      mark(i);
      await play.word(text);
      await sleep(220);
    }
    mark(-1);
    return;
  }
  await play.follow(sentenceKey, buttons.map((b) => b.textContent ?? ''), mark);
  mark(-1);
}
