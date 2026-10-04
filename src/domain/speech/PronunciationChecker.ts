/**
 * Port for "listen to the child read". v1: browser speech recognition (free).
 * v1.2: a paid phoneme-level checker behind a Vercel function. Screens only see this interface.
 */
export type ListenStatus =
  | 'heard'        // got transcripts
  | 'silence'      // listened, nobody spoke
  | 'hung'         // recognizer never answered (iOS 27 bug after audio playback)
  | 'denied'       // mic permission refused
  | 'unavailable'  // no recognizer in this browser
  | 'error';

export interface ListenResult {
  status: ListenStatus;
  /** Best first. For sentences, the joined final transcript per alternative. */
  alternatives: string[];
  ms: number;
  error?: string;
}

export interface ListenOptions {
  expected: string;
  mode: 'word' | 'sentence';
  /** Watchdog: give up and report 'hung' after this long with no answer. */
  timeoutMs?: number;
}

export interface PronunciationChecker {
  readonly available: boolean;
  listen(options: ListenOptions): Promise<ListenResult>;
  cancel(): void;
}

/**
 * Tracks recognizer health over a session. Two hangs/errors in a row means the mic can't be trusted
 * on this device right now, so the session switches to "Grown-up ✓" instead of frustrating the child.
 */
export class MicHealth {
  private failures = 0;
  private tripped = false;
  constructor(private readonly maxFailures = 2) {}

  record(status: ListenStatus): void {
    if (status === 'heard' || status === 'silence') { this.failures = 0; return; }
    if (status === 'denied' || status === 'unavailable') { this.tripped = true; return; }
    this.failures++;
    if (this.failures >= this.maxFailures) this.tripped = true;
  }

  get useGrownUpCheck(): boolean { return this.tripped; }
}
