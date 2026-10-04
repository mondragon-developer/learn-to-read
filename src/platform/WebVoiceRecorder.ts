import type { RecordError, RecordStart, Take, TakeReport, VoiceRecorder } from '@domain/audio/VoiceRecorder';
import { setAudioSession, type AudioEngine } from './AudioEngine';

/** Recorder formats in preference order: Chrome records webm/opus, Safari only mp4/aac. */
const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
/** Ask for data every quarter second so a short take is never empty. */
const TIMESLICE_MS = 250;

const ERRORS: Readonly<Record<string, RecordError>> = {
  NotAllowedError: 'denied', SecurityError: 'denied', PermissionDeniedError: 'denied',
  NotFoundError: 'no-mic', OverconstrainedError: 'no-mic', DevicesNotFoundError: 'no-mic',
  NotReadableError: 'busy', AbortError: 'busy', TrackStartError: 'busy',
};

/**
 * Records with getUserMedia + MediaRecorder; the mic opens per take and is released right after.
 * Playback goes through the shared AudioEngine (unlocked by the first tap) so iOS never blocks
 * it, and every take is measured (length, loudness, size) so the UI can show what was captured.
 */
export class WebVoiceRecorder implements VoiceRecorder {
  constructor(private readonly engine: AudioEngine) {}

  get available(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async record(maxMs: number): Promise<RecordStart> {
    if (!this.available) return { ok: false, error: 'unsupported' };
    setAudioSession('play-and-record');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      setAudioSession('playback');
      const name = e instanceof Error ? e.name : '';
      return { ok: false, error: ERRORS[name] ?? 'unknown', detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setAudioSession('playback');
      return { ok: false, error: 'unsupported', detail: String(e) };
    }
    const meter = this.meter(stream);
    const chunks: Blob[] = [];
    const t0 = performance.now();
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise<Take>((resolve) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        meter.close();
        setAudioSession('playback'); // back to the loudspeaker for playback
        const type = rec.mimeType || mimeType || chunks[0]?.type || 'audio/mp4';
        resolve({ blob: new Blob(chunks, { type }), type, ms: Math.round(performance.now() - t0) });
      };
    });
    const timer = window.setTimeout(() => stop(), maxMs);
    const stop = (): void => {
      window.clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
    };
    rec.start(TIMESLICE_MS);
    return { ok: true, recording: { stop, done, level: meter.level } };
  }

  async play(take: Take): Promise<TakeReport> {
    const bytes = take.blob.size;
    if (!bytes) return { seconds: 0, peak: -1, bytes, via: 'none', error: 'empty recording' };
    const ctx = this.engine.context;
    if (ctx) {
      try {
        const buffer = await ctx.decodeAudioData(await take.blob.arrayBuffer());
        await this.engine.play(buffer);
        return { seconds: buffer.duration, peak: peakOf(buffer), bytes, via: 'engine' };
      } catch {
        // fall through to the <audio> element
      }
    }
    return this.playElement(take.blob, bytes);
  }

  /** Last resort for formats Web Audio can't decode. Loudness is unknown here (peak -1). */
  private playElement(blob: Blob, bytes: number): Promise<TakeReport> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      const finish = (r: TakeReport): void => { URL.revokeObjectURL(url); resolve(r); };
      audio.onended = () => finish({ seconds: Number.isFinite(audio.duration) ? audio.duration : 0, peak: -1, bytes, via: 'element' });
      audio.onerror = () => finish({ seconds: 0, peak: -1, bytes, via: 'none', error: `can't play ${blob.type || 'this format'}` });
      audio.play().catch((e: unknown) => finish({ seconds: 0, peak: -1, bytes, via: 'none', error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }));
    });
  }

  /** Live input level from an analyser on the shared context (never connected to the speakers). */
  private meter(stream: MediaStream): { level: () => number; close: () => void } {
    const ctx = this.engine.context;
    if (!ctx) return { level: () => 0, close: () => undefined };
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      return {
        level: () => {
          analyser.getFloatTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v));
          return Math.min(1, peak * 1.6);
        },
        close: () => { source.disconnect(); analyser.disconnect(); },
      };
    } catch {
      return { level: () => 0, close: () => undefined };
    }
  }
}

function peakOf(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 4) peak = Math.max(peak, Math.abs(data[i] ?? 0));
  }
  return peak;
}
