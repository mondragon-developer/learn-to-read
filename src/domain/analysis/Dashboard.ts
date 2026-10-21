import type { ContentLibrary } from '../content/ContentLibrary';
import type { StorySkill } from '../content/types';
import { isMastered, rebuildDeck } from '../srs/Leitner';
import type { PracticeEvent } from '../storage/events';
import { standardStats, type StandardStat } from '../standards/Standards';

export interface DayMinutes { day: number; minutes: number }
export interface TroubleWord { id: string; text: string; misses: number; heard: string[] }
export interface SkillScore { skill: StorySkill; right: number; total: number }

/** One one-minute read (ELA.1.F.1.4). */
export interface FluencyRecord { day: number; wcpm: number; words: number; errors: number; prosody: number; season: string }

/** One assessed sentence from the reading coach (newest first on the dashboard). */
export interface SentenceRecord { day: number; text: string; words: number; wordsRead: number; whole: boolean; helped: string }

export interface DashboardData {
  unverified: { day: number; text: string }[];
  minutes: DayMinutes[];
  minutesThisWeek: number;
  sessionsThisWeek: number;
  wordsMastered: number;
  wordsLearning: number;
  troubleWords: TroubleWord[];
  storySkills: SkillScore[];
  /** Every Florida benchmark practiced, from all events (see standards/Standards). */
  standards: StandardStat[];
  /** One-minute reads, newest first. */
  fluency: FluencyRecord[];
  /** Share of review reads right on the first try (accuracy, ELA.1.F.1.4); null before any review. */
  firstTryRate: number | null;
  /** Reading coach: recent sentences and totals (words read alone / words; whole sentences right). */
  sentences: SentenceRecord[];
  sentenceTotals: { words: number; wordsRead: number; sentences: number; whole: number };
}

const SENTENCES_SHOWN = 12;

const DAYS_SHOWN = 14;

/** Everything the parent dashboard shows, computed from events only (works offline, any device). */
export function dashboard(events: PracticeEvent[], library: ContentLibrary, today: number): DashboardData {
  const sessions = events.filter((e) => e.activity === 'session');
  const byDay = new Map<number, number>();
  for (const s of sessions) byDay.set(s.day, (byDay.get(s.day) ?? 0) + Number(s.meta?.durationMs ?? 0) / 60_000);
  const minutes: DayMinutes[] = [];
  for (let d = today - DAYS_SHOWN + 1; d <= today; d++) minutes.push({ day: d, minutes: Math.round((byDay.get(d) ?? 0) * 10) / 10 });
  const week = sessions.filter((s) => s.day > today - 7);

  const deck = rebuildDeck(events);
  const states = [...deck.values()];
  const wordsMastered = states.filter(isMastered).length;

  const missesById = new Map<string, TroubleWord>();
  for (const e of events) {
    if (!e.itemId.startsWith('w:') || e.outcome !== 'missed') continue;
    const t = missesById.get(e.itemId) ?? { id: e.itemId, text: library.card(e.itemId)?.text ?? e.itemId.slice(2), misses: 0, heard: [] };
    t.misses++;
    const heard = e.meta?.heard;
    if (typeof heard === 'string' && heard && !t.heard.includes(heard)) t.heard.push(heard);
    missesById.set(e.itemId, t);
  }
  const troubleWords = [...missesById.values()]
    .filter((t) => (deck.get(t.id)?.box ?? 1) <= 2)
    .sort((a, b) => b.misses - a.misses || a.text.localeCompare(b.text))
    .slice(0, 8);

  const skillMap = new Map<StorySkill, SkillScore>();
  for (const e of events) {
    if (e.outcome === 'unverified' || e.activity !== 'story-question') continue;
    const skill = e.meta?.skill as StorySkill | undefined;
    if (!skill) continue;
    const s = skillMap.get(skill) ?? { skill, right: 0, total: 0 };
    s.total++;
    if (e.outcome !== 'missed') s.right++;
    skillMap.set(skill, s);
  }

  const fluency: FluencyRecord[] = events.filter((e) => e.activity === 'fluency').sort((a, b) => b.at - a.at).map((e) => ({
    day: e.day, wcpm: Number(e.meta?.wcpm ?? 0), words: Number(e.meta?.words ?? 0), errors: Number(e.meta?.errors ?? 0),
    prosody: Number(e.meta?.prosody ?? 0), season: String(e.meta?.season ?? ''),
  }));

  const reads = events.filter((e) => e.activity === 'review' && e.outcome !== 'unverified');
  const firstTryRate = reads.length ? reads.filter((e) => e.outcome === 'first-try').length / reads.length : null;

  const checked = events.filter((e) => e.outcome !== 'unverified' && e.activity === 'sentence' && typeof e.meta?.words === 'number');
  const sentences: SentenceRecord[] = checked.slice().sort((a, b) => b.at - a.at).slice(0, SENTENCES_SHOWN).map((e) => ({
    day: e.day, text: String(e.meta?.text ?? e.itemId), words: Number(e.meta?.words), wordsRead: Number(e.meta?.wordsRead ?? 0),
    whole: e.meta?.whole === true, helped: String(e.meta?.helped ?? ''),
  }));
  const sentenceTotals = checked.reduce((t, e) => ({
    words: t.words + Number(e.meta?.words ?? 0), wordsRead: t.wordsRead + Number(e.meta?.wordsRead ?? 0),
    sentences: t.sentences + 1, whole: t.whole + (e.meta?.whole === true ? 1 : 0),
  }), { words: 0, wordsRead: 0, sentences: 0, whole: 0 });

  return {
    unverified: events.filter((e) => e.outcome === 'unverified' && e.activity !== 'soccer').sort((a, b) => b.at - a.at).slice(0, 20).map((e) => ({
      day: e.day, text: String(e.meta?.text ?? library.card(e.itemId)?.text ?? e.itemId.replace(/^(blend|sound-it-out):/, '')),
    })),
    sentences,
    sentenceTotals,
    minutes,
    minutesThisWeek: Math.round(week.reduce((n, s) => n + Number(s.meta?.durationMs ?? 0), 0) / 60_000),
    sessionsThisWeek: week.length,
    wordsMastered,
    wordsLearning: states.length - wordsMastered,
    troubleWords,
    storySkills: [...skillMap.values()],
    standards: standardStats(events, library),
    fluency,
    firstTryRate,
  };
}
