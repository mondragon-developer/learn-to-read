/** Shared by reading parts; soccer uses its own Kit so play can run during a pause. */
export class PracticePause {
  private pending: Promise<void> | null = null;
  private release: (() => void) | null = null;
  private started = 0;
  private total = 0;
  get paused(): boolean { return this.pending !== null; }
  now(): number { return (this.paused ? this.started : performance.now()) - this.total; }
  async wait(): Promise<void> { while (this.pending) await this.pending; }
  pause(): () => void {
    if (this.pending) throw new Error('Practice already paused');
    this.started = performance.now();
    this.pending = new Promise<void>((resolve) => { this.release = resolve; });
    return () => {
      if (!this.pending) return;
      this.total += performance.now() - this.started;
      const release = this.release;
      this.pending = this.release = null;
      release?.();
    };
  }
}
