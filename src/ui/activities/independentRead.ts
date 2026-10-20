import type { PronunciationChecker, ListenResult } from '@domain/speech/PronunciationChecker';
import type { AnswerMatcher, MatchLevel } from '@domain/speech/AnswerMatcher';
import type { SentenceMatcher } from '@domain/speech/SentenceMatcher';
import { outcomeFor } from '@domain/speech/Grading';
import type { ReadResult, SentenceRead, Voice } from './readAloud';
import { h, replace } from '../dom';

/** Child-led practice. An unavailable mic never turns into an adult-only check. */
export class IndependentReader {


  constructor(
    private readonly voice: Voice,
    private readonly checker: PronunciationChecker,
    private readonly words: AnswerMatcher,
    private readonly sentences: SentenceMatcher,
    private readonly signal: AbortSignal,
    private readonly stopVoice: () => void,
    private readonly state = { unavailable: false },
  ) {}

  get fallback(): boolean { return this.state.unavailable || !this.checker.available; }

  private active(): void { this.signal.throwIfAborted(); }

  async readWord(panel: HTMLElement, target: string, label: string): Promise<ReadResult> {
    const levels: MatchLevel[] = [];
    let heard = '';
    while (levels.length < 2) {
      const res = await this.listen(panel, target, 'word', levels.length ? 'Try again!' : label);
      if (!res) {
        await this.repeat(panel, () => this.voice.word(target), 'repeat-word');
        return { outcome: 'unverified', source: 'self', heard: '' };
      }
      const match = this.words.matchWord(target, res.alternatives);
      heard = match.heard;
      levels.push(match.level);
      if (match.level === 'match') break;
      await this.repeat(panel, () => this.voice.word(target), 'repeat-word');
      if (match.level === 'close') break;
    }
    // Each failed check already offered a supported repetition; retain its actual result.
    return { outcome: outcomeFor(levels), source: 'mic', heard };
  }

  async readSentence(panel: HTMLElement, text: string, model: (stopped?: () => boolean) => Promise<void>, label: string): Promise<SentenceRead> {
    const res = await this.listen(panel, text, 'sentence', label);
    if (!res) {
      await this.repeat(panel, model, 'repeat-sentence');
      return { pass: false, match: null, source: 'self', unverified: true };
    }
    const match = this.sentences.matchBest(text, res.alternatives);
    if (!match.pass) await this.repeat(panel, model, 'repeat-sentence');
    return { pass: match.pass, match, source: 'mic' };
  }

  /** No recording or automatic grading: model, child repeats, child moves on. */
  async repeat(panel: HTMLElement, model: (stopped?: () => boolean) => Promise<void>, prompt = 'repeat-sentence'): Promise<void> {
    this.active();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let playback = 0;
      const cleanup = (): void => this.signal.removeEventListener('abort', abort);
      const abort = (): void => { settled = true; playback++; cleanup(); this.stopVoice(); reject(this.signal.reason); };
      this.signal.addEventListener('abort', abort, { once: true });
      const next = h('button', { class: 'btn big ok practice-next', onClick: () => {
        if (settled) return;
        settled = true; playback++; cleanup(); this.stopVoice(); resolve();
      } }, '➜ I said it!');
      const play = async (withPrompt: boolean): Promise<void> => {
        const token = ++playback;
        this.stopVoice();
        const stopped = (): boolean => settled || this.signal.aborted || token !== playback;
        try {
          await model(stopped);
          if (withPrompt && !stopped()) await this.voice.prompt(prompt);
        } catch { /* A missing clip must not hide the child's Continue control. */ }
      };
      const again = h('button', { class: 'btn soft', onClick: () => void play(false) }, '🔊 Listen again');
      replace(panel, h('p', { class: 'coach' }, 'Now you! Say it out loud.'), next, again);
      void play(true);
    });
    this.active();
  }

  private async listen(panel: HTMLElement, expected: string, mode: 'word' | 'sentence', label: string): Promise<ListenResult | null> {
    this.active();
    if (this.fallback) return null;
    return new Promise<ListenResult | null>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => this.signal.removeEventListener('abort', abort);
      const finish = (result: ListenResult | null): void => {
        if (settled) return;
        settled = true;
        cleanup();
        this.stopVoice();
        this.checker.cancel();
        resolve(result);
      };
      const abort = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        this.checker.cancel();
        reject(this.signal.reason);
      };
      this.signal.addEventListener('abort', abort, { once: true });
      const fallback = h('button', { class: 'btn soft', onClick: () => finish(null) }, '👂 Listen & repeat');
      const mic = h('button', { class: 'mic pulse', 'aria-label': label, onClick: async () => {
        this.stopVoice();
        mic.disabled = true;
        mic.classList.remove('pulse');
        mic.classList.add('listening');
        mic.textContent = '🎤 Listening…';
        try {
          const res = await this.checker.listen({ expected, mode, timeoutMs: mode === 'word' ? 6000 : 12000 });
          if (settled) return;
          if (res.status !== 'heard') this.state.unavailable = true;
          finish(res.status === 'heard' ? res : null);
        } catch {
          if (!settled) { this.state.unavailable = true; finish(null); }
        }
      } }, h('span', { class: 'mic-icon', 'aria-hidden': 'true' }, '🎤'), h('span', {}, label));
      replace(panel, mic, fallback);
      void this.voice.prompt(mode === 'sentence' ? 'read-sentence-now' : 'tap-mic').catch(() => undefined);
    });
  }
}
