import type { SessionSettings } from '../session/SessionPlanner';

export const PROFILE_SCHEMA = 1;

/** A child. First name only - no last name, birthday or school ids are ever stored. */
export interface Profile {
  v: typeof PROFILE_SCHEMA;
  id: string;
  firstName: string;
  /** Jersey color and number on the player card. */
  color: string;
  number: number;
  createdAt: number;
  updatedAt: number;
  settings: ProfileSettings;
  /** School screening scores the parent types in (FAST/Star Unified scale), newest last. Optional. */
  fast?: FastScore[];
}

export interface FastScore { date: string; score: number }

/** FAST grade 1 Level 3 band on the Star Unified scale (Rule 6A-1.09422, end of year). */
export const FAST_GRADE1_LEVEL3 = { min: 844, max: 893 } as const;

export interface ProfileSettings extends SessionSettings {
  /**
   * How a read-aloud is checked. 'independent' (new players): automatic mic or unverified repetition.
   * 'record': he records, hears himself, hears the model,
   * a grown-up taps ✓. 'mic': free speech recognition decides. Recordings stay in memory only.
   */
  checkMode?: 'record' | 'mic' | 'independent';
  /** First listen to the whole story: 'follow' = natural pace, pointed (default); 'word' = one word at a time. */
  readingPace?: 'word' | 'follow';
}

export const DEFAULT_SETTINGS: ProfileSettings = { minutes: 5, writing: 'trace', startUnit: 1, challenge: false, checkMode: 'independent', readingPace: 'follow' };

export const JERSEY_COLORS = ['#1F7A4D', '#2D5BD0', '#D2462E', '#E8A317', '#7A3FB8', '#0F8A8A'] as const;

const MAX_NAME = 20;

/**
 * Validates a profile from outside this device (backup file, server) and fills missing settings.
 * Returns null when it isn't a profile. The color must be a jersey color: it ends up in a style attribute.
 */
export function toProfile(x: unknown): Profile | null {
  const p = x as Partial<Profile> | null;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || typeof p.firstName !== 'string') return null;
  const colors: readonly string[] = JERSEY_COLORS;
  const fast = Array.isArray(p.fast)
    ? p.fast.filter((f): f is FastScore => !!f && typeof f.date === 'string' && Number.isFinite(f.score))
    : undefined;
  return {
    v: PROFILE_SCHEMA,
    id: p.id,
    firstName: p.firstName.trim().slice(0, MAX_NAME) || '?',
    color: colors.includes(p.color ?? '') ? (p.color as string) : JERSEY_COLORS[0],
    number: Math.max(0, Math.min(99, Math.round(Number(p.number) || 0))),
    createdAt: Number(p.createdAt) || 0,
    updatedAt: Number(p.updatedAt) || 0,
    settings: { ...DEFAULT_SETTINGS, minutes: 10, challenge: true, checkMode: 'record', ...(p.settings && typeof p.settings === 'object' ? p.settings : {}) },
    fast,
  };
}

/** Last write wins per profile (settings are tiny and parent-owned; events carry the real history). */
export function mergeProfiles(a: Profile[], b: Profile[]): Profile[] {
  const map = new Map<string, Profile>();
  for (const p of [...a, ...b]) {
    const cur = map.get(p.id);
    if (!cur || p.updatedAt > cur.updatedAt) map.set(p.id, p);
  }
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt);
}
