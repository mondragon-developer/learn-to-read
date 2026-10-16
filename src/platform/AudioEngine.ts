/** Extra wait past a clip's length before giving up on its onended. */
const PLAY_GRACE_MS = 1500;

/**
 * The one Web Audio context of the app. Clips and the child's recordings both play through it:
 * once unlocked by a tap it can play at any time, while a fresh <audio> element started after a
 * few awaits is blocked or muted by iOS (the "I only hear the app, not him" bug).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;

  get context(): AudioContext | null { return this.ctx; }

  /** Must run inside a tap at least once (iOS keeps audio locked until then). */
  async unlock(): Promise<AudioContext> {
    // "playback" also keeps iOS from muting Web Audio when the side silent switch is on.
    setAudioSession('playback');
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => undefined);
    // A silent buffer played inside the tap is what actually unlocks iOS output.
    const silent = this.ctx.createBuffer(1, 1, 22050);
    const src = this.ctx.createBufferSource();
    src.buffer = silent;
    src.connect(this.ctx.destination);
    src.start();
    return this.ctx;
  }

  /**
   * Plays a decoded buffer; resolves when it ends. A suspended or interrupted context (iOS after
   * mic use, a call, backgrounding) never fires onended, so a watchdog ends the wait instead of
   * freezing the session.
   */
  async play(buffer: AudioBuffer, rate = 1, onStart?: (src: AudioBufferSourceNode) => void, canPlay: () => boolean = () => true): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    if (!canPlay()) return;
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      const guard = setTimeout(resolve, (buffer.duration / rate) * 1000 + PLAY_GRACE_MS);
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.connect(ctx.destination);
      src.onended = () => { clearTimeout(guard); resolve(); };
      onStart?.(src);
      src.start();
    });
  }
}

/**
 * iOS/iPadOS 17+ Audio Session API: while the mic is open Safari uses "play-and-record", which
 * can route playback to the quiet earpiece. Setting "playback" afterwards sends it back to the speaker.
 */
export function setAudioSession(type: 'play-and-record' | 'playback' | 'auto'): void {
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try { session.type = type; } catch { /* older Safari: no-op */ }
}
