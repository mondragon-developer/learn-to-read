/** Port for playing clips. Screens say `audio.play('word:cat')` and never touch <audio> or TTS. */
export interface AudioPort {
  /** Must run inside a user tap once (iOS keeps audio locked until then). */
  unlock(): Promise<void>;
  play(key: string, opts?: { rate?: number }): Promise<void>;
  /** Plays several clips back to back ("Which one rhymes with" + "cat"). */
  sequence(keys: string[], gapMs?: number): Promise<void>;
  /**
   * Plays a sentence clip and calls onWord(i) as each word is spoken, so the screen can point at it.
   * `words` are the sentence's display tokens; onWord(-1) fires at the end.
   */
  follow(key: string, words: string[], onWord: (i: number) => void): Promise<void>;
  stop(): void;
  has(key: string): boolean;
}
