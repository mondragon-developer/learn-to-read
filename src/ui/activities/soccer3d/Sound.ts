/** Small original synthesized effects. No network, audio files, or persistent background hiss. */
export class StadiumSound {
  private context: AudioContext | null = null;
  private muted = false;
  private nodes = new Set<AudioScheduledSourceNode>();
  unlock(): void {
    if (this.muted) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => undefined); } catch { /* Game works silently. */ }
  }
  setMuted(muted: boolean): void { this.muted = muted; if (muted) this.stop(); }
  private tone(frequency: number, at: number, duration: number, volume: number): void {
    const c = this.context; if (!c || this.muted) return;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(frequency, at);
    g.gain.setValueAtTime(.001, at); g.gain.exponentialRampToValueAtTime(volume, at + .015); g.gain.exponentialRampToValueAtTime(.001, at + duration);
    o.connect(g).connect(c.destination); this.nodes.add(o); o.onended = () => { o.disconnect(); g.disconnect(); this.nodes.delete(o); }; o.start(at); o.stop(at + duration);
  }
  private noise(duration: number, volume: number, frequency: number): void {
    const c = this.context; if (!c || this.muted) return;
    const buffer = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = frequency; gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(c.destination); this.nodes.add(source);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.nodes.delete(source); }; source.start();
  }
  kick(): void { if (!this.context) return; this.noise(.17, .18, 1200); this.tone(105, this.context.currentTime, .13, .18); }
  impact(goal: boolean, frame = false): void {
    const c = this.context; if (!c || this.muted) return;
    this.noise(goal ? .65 : .15, goal ? .08 : .12, goal ? 2300 : 900);
    if (goal) [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, c.currentTime + i * .075, .35, .055));
    else if (frame) this.tone(380, c.currentTime, .32, .08);
  }
  stop(): void { this.nodes.forEach((node) => { try { node.stop(); } catch { /* Already ended. */ } }); this.nodes.clear(); }
  dispose(): void { this.stop(); void this.context?.close().catch(() => undefined); this.context = null; }
}
