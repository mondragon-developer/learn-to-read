/**
 * Port: record the child for a few seconds and play it back next to the model.
 * Recordings live only in memory for that word and are never saved or uploaded.
 */
export interface Take {
  blob: Blob;
  /** MIME type the browser actually recorded (audio/mp4 on Safari, audio/webm on Chrome). */
  type: string;
  /** Wall-clock length of the recording. */
  ms: number;
}

export interface Recording {
  /** Stop early (the child finished). */
  stop(): void;
  /** Input loudness right now, 0..1, for a live level bar (0 when unknown). */
  level(): number;
  /** Resolves with the take (possibly empty: check it with checkTake). */
  readonly done: Promise<Take>;
}

/** Why recording could not start, in words a parent can act on. */
export type RecordError = 'denied' | 'no-mic' | 'unsupported' | 'busy' | 'unknown';

export type RecordStart = { ok: true; recording: Recording } | { ok: false; error: RecordError; detail?: string };

/** What playback found out about a take. */
export interface TakeReport {
  /** Decoded length in seconds (0 if it could not be decoded). */
  seconds: number;
  /** Loudest sample, 0..1 (-1 when the take could not be decoded, so loudness is unknown). */
  peak: number;
  bytes: number;
  /** How it was played: shared audio engine, an <audio> fallback, or not at all. */
  via: 'engine' | 'element' | 'none';
  error?: string;
}

export interface VoiceRecorder {
  readonly available: boolean;
  /** Starts recording now; stops by itself after maxMs. */
  record(maxMs: number): Promise<RecordStart>;
  /** Plays the take and reports what it contained. */
  play(take: Take): Promise<TakeReport>;
}

export type TakeProblem = 'empty' | 'silent' | 'unplayable';

/** Below this the child did not speak (or the mic is muted/blocked). */
export const SILENT_PEAK = 0.02;
const MIN_BYTES = 800;
const MIN_SECONDS = 0.25;

/** Decides whether a played take was usable, or what went wrong. */
export function checkTake(r: TakeReport): TakeProblem | null {
  if (r.via === 'none') return r.bytes < MIN_BYTES ? 'empty' : 'unplayable';
  if (r.bytes < MIN_BYTES || (r.seconds > 0 && r.seconds < MIN_SECONDS)) return 'empty';
  if (r.peak >= 0 && r.peak < SILENT_PEAK) return 'silent';
  return null;
}
