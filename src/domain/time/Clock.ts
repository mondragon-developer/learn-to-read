/** Time source port. Days are local calendar days, so "practice today" means the child's today. */
export interface Clock {
  now(): number;
  /** Local calendar day number (days since 1970-01-01 in the device's time zone). */
  today(): number;
}

const DAY_MS = 86_400_000;

export function dayNumber(ms: number, tzOffsetMinutes: number): number {
  return Math.floor((ms - tzOffsetMinutes * 60_000) / DAY_MS);
}

export const systemClock: Clock = {
  now: () => Date.now(),
  today: () => dayNumber(Date.now(), new Date().getTimezoneOffset()),
};

/** Deterministic clock for tests. */
export class FixedClock implements Clock {
  constructor(private ms: number, private readonly tzOffsetMinutes = 0) {}
  now(): number { return this.ms; }
  today(): number { return dayNumber(this.ms, this.tzOffsetMinutes); }
  advanceDays(days: number): void { this.ms += days * DAY_MS; }
  advanceMs(ms: number): void { this.ms += ms; }
}
