import type { AudioPort } from '@domain/audio/AudioPort';

export type Command = 'word' | 'whole' | 'next' | 'turn';

/**
 * Playback control for the reading coach: pause/continue, and commands from the control bar
 * (replay word by word, replay all at once, next sentence). Pausing stops the audio at once;
 * continuing replays the interrupted piece from its start, so nothing is half-heard.
 */
export class Transport {
  paused = false;
  private epoch = 0;
  private pending: Command | null = null;
  private resumeWaiters: (() => void)[] = [];
  private commandWaiters: ((c: Command) => void)[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly audio: AudioPort) {}

  /** Repaint hook for the control bar. */
  onChange(fn: () => void): void { this.listeners.add(fn); }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.epoch++;
    this.audio.stop();
    this.emit();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.resumeWaiters.splice(0).forEach((f) => f());
    this.emit();
  }

  /** A control-bar command: interrupts whatever plays and is picked up by the coach loop. */
  send(c: Command): void {
    this.pending = c;
    this.epoch++;
    this.audio.stop();
    this.commandWaiters.splice(0).forEach((f) => f(c));
    if (this.paused) this.resume();
  }

  /** Takes the pending command, if any. */
  take(): Command | null {
    const c = this.pending;
    this.pending = null;
    return c;
  }

  /** True once the piece started at `epoch` was interrupted (pause or command). */
  interrupted(epoch: number): boolean { return epoch !== this.epoch; }

  /** Plays an audio piece; if paused mid-way, waits and plays it again. A command ends it for good. */
  async run(piece: (stopped: () => boolean) => Promise<void>): Promise<void> {
    for (;;) {
      if (this.paused) await new Promise<void>((r) => this.resumeWaiters.push(r));
      if (this.pending) return;
      const e = this.epoch;
      await piece(() => this.interrupted(e));
      if (!this.interrupted(e) || this.pending) return;
    }
  }

  /**
   * The next command (used to break out of a wait for the grown-up's tap). Call dispose() once the
   * wait ended another way, or the waiter lingers until the next command.
   */
  nextCommand(): { promise: Promise<Command>; dispose: () => void } {
    let waiter!: (c: Command) => void;
    const promise = new Promise<Command>((r) => { waiter = r; this.commandWaiters.push(r); });
    return { promise, dispose: () => { this.commandWaiters = this.commandWaiters.filter((w) => w !== waiter); } };
  }

  private emit(): void { this.listeners.forEach((f) => f()); }
}
