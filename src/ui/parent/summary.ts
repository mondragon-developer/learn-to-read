import { dashboard, type DayMinutes, type FluencyRecord } from '@domain/analysis/Dashboard';
import { normFor, seasonOf } from '@domain/reading/Fluency';
import { homeworkSkill } from '@domain/session/SessionPlanner';
import { FAST_GRADE1_LEVEL3, type Profile } from '@domain/profiles/Profile';
import { rebuildDeck } from '@domain/srs/Leitner';
import benchmarks from '@data/benchmarks.json';
import type { I18n } from '@domain/i18n/i18n';
import type { AppContext } from '../context';
import { h } from '../dom';

/** Resumen: what the parent needs at a glance, all computed from this child's events. */
export async function summary(ctx: AppContext, p: Profile): Promise<HTMLElement> {
  const { i18n: t, library, clock } = ctx;
  const events = await ctx.log.events(p.id);
  const today = clock.today();
  const d = dashboard(events, library, today);
  const unitNow = library.unit(ctx.planner.currentUnit(library, rebuildDeck(events), p.settings.startUnit));
  const benchMeta = new Map(benchmarks.benchmarks.map((b) => [b.code, b]));
  const short = (code: string): string => (t.locale === 'es' ? benchMeta.get(code)?.es : benchMeta.get(code)?.short) ?? code;

  return h('div', { class: 'parent-section' },
    h('div', { class: 'tiles-row' },
      tile(t.t('sum.week'), t.t('sum.minutes', { n: d.minutesThisWeek }), d.sessionsThisWeek === 1 ? t.t('sum.session1') : t.t('sum.sessions', { n: d.sessionsThisWeek })),
      tile(t.t('sum.mastered'), String(d.wordsMastered), `${t.t('sum.learning')}: ${d.wordsLearning}`),
      tile(t.t('sum.firstTry'), d.firstTryRate === null ? '—' : `${Math.round(d.firstTryRate * 100)}%`, ''),
      tile(t.t('sum.unit'), unitNow ? `${unitNow.order}` : '—', unitNow?.title ?? '')),
    minutesChart(d.minutes, today, t),
    homeworkLine(ctx, p),
    fastCard(ctx, p),
    h('h3', {}, t.t('sum.sentences')),
    d.sentences.length
      ? h('div', {},
        h('p', { class: 'muted' }, t.t('sum.sentenceTotals', { read: d.sentenceTotals.wordsRead, total: d.sentenceTotals.words, whole: d.sentenceTotals.whole, n: d.sentenceTotals.sentences })),
        h('ul', { class: 'sentence-log' }, d.sentences.map((x) => h('li', {},
          h('span', { class: 'sl-text', lang: 'en' }, x.text),
          h('span', { class: `sl-score ${x.wordsRead === x.words ? 'good' : ''}` }, t.t('sum.sentenceWords', { read: x.wordsRead, total: x.words })),
          h('span', { class: `sl-score ${x.whole ? 'good' : ''}` }, x.whole ? t.t('sum.sentenceWhole') : t.t('sum.sentenceWholeNo')),
          x.helped ? h('span', { class: 'muted small' }, t.t('sum.sentenceHelped', { w: x.helped })) : null))))
      : h('p', { class: 'muted' }, t.t('sum.sentencesNone')),
    h('h3', {}, t.t('sum.trouble')),
    d.troubleWords.length
      ? h('ul', { class: 'trouble' }, d.troubleWords.map((w) => h('li', {},
        h('b', {}, w.text), ` ×${w.misses}`, w.heard.length ? h('span', { class: 'muted' }, ` · ${t.t('sum.heard', { w: w.heard.slice(0, 3).join(', ') })}`) : null,
        library.card(w.id)?.es ? h('span', { class: 'muted' }, ` · ${library.card(w.id)?.es}`) : null)))
      : h('p', { class: 'muted' }, t.t('sum.troubleNone')),
    h('h3', {}, t.t('sum.skills')),
    d.storySkills.length
      ? h('div', { class: 'meters' }, d.storySkills.map((s) => meter(t.t(`skill.${s.skill}`), s.right, s.total)))
      : h('p', { class: 'muted' }, t.t('sum.skillsNone')),
    h('h3', {}, t.t('sum.fluency')),
    fluencyCard(ctx, d.fluency),
    h('h3', {}, t.t('sum.standards')),
    d.standards.length
      ? h('div', { class: 'meters' }, d.standards.map((x) => {
        const meta = benchMeta.get(x.code);
        const k = meta && 'grade' in meta && meta.grade === 'K' ? ` (${t.t('sum.kReview')})` : '';
        const when = x.lastDay === today ? t.t('sum.today2') : t.t('sum.daysAgo', { n: today - x.lastDay });
        return h('div', { class: 'std-row' }, meter(`${short(x.code)}${k} · ${x.code}`, x.correct, x.attempts),
          h('span', { class: 'small muted std-when' }, t.t('sum.stdRow', { pct: Math.round((x.correct / x.attempts) * 100), n: x.attempts, when })));
      }))
      : h('p', { class: 'muted' }, t.t('sum.standardsNone')));
}

function tile(label: string, value: string, sub: string): HTMLElement {
  return h('div', { class: 'stat-tile' }, h('span', { class: 'label' }, label), h('b', {}, value), sub ? h('span', { class: 'muted small' }, sub) : null);
}

function meter(label: string, n: number, total: number): HTMLElement {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return h('div', { class: 'meter-row' }, h('span', { class: 'meter-label' }, label),
    h('span', { class: 'meter', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': label }, h('span', { style: `width:${pct}%` })),
    h('span', { class: 'meter-value' }, `${n}/${total}`));
}

const dayDate = (day: number): Date => new Date(day * 86_400_000 + 12 * 3_600_000);
const dayLabel = (day: number, locale: string): string => dayDate(day).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const dayNum = (day: number): string => String(dayDate(day).getUTCDate());

/**
 * Single-series column chart (dataviz specs): one hue, columns ≤24px with 4px rounded tops,
 * hairline baseline, labels only on today and the best day, tooltip per column, table view.
 */
function minutesChart(data: DayMinutes[], today: number, t: I18n): HTMLElement {
  const title = t.t('sum.chartTitle');
  const max = Math.max(5, ...data.map((d) => d.minutes));
  const best = data.reduce((a, b) => (b.minutes > a.minutes ? b : a), data[0] as DayMinutes);
  const cols = data.map((d) => {
    const label = `${dayLabel(d.day, t.locale)}: ${d.minutes} min`;
    const showValue = d.minutes > 0 && (d.day === today || d.day === best.day);
    return h('div', { class: 'col', tabindex: '0', 'aria-label': label, 'data-tip': label },
      showValue ? h('span', { class: 'col-value' }, String(d.minutes)) : null,
      h('span', { class: 'col-bar', style: `height:${(d.minutes / max) * 100}%` }),
      h('span', { class: 'col-day' }, d.day === today ? t.t('sum.today') : dayNum(d.day)));
  });
  return h('figure', { class: 'chart' },
    h('figcaption', {}, title),
    h('div', { class: 'cols', role: 'img', 'aria-label': title }, cols),
    h('details', {}, h('summary', {}, t.t('sum.chartTable')),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t.t('sum.day')), h('th', {}, 'min'))),
        h('tbody', {}, data.map((d) => h('tr', {}, h('td', {}, dayLabel(d.day, t.locale)), h('td', {}, String(d.minutes))))))));
}

function homeworkLine(ctx: AppContext, p: Profile): HTMLElement | null {
  const t = ctx.i18n;
  const skill = homeworkSkill(p.settings, ctx.clock.today());
  if (!skill || !p.settings.homework) return null;
  const until = new Date(p.settings.homework.until * 86_400_000 + 12 * 3_600_000).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return h('p', { class: 'homework-row' }, t.t('sum.homework', { skill: t.t(`skill.${skill}`), date: until }));
}

/** Latest one-minute read against the season's 50th-percentile target, plus the history. */
function fluencyCard(ctx: AppContext, reads: FluencyRecord[]): HTMLElement {
  const t = ctx.i18n;
  const latest = reads[0];
  if (!latest) return h('p', { class: 'muted' }, t.t('sum.fluencyNone'));
  const norm = normFor(seasonOf(new Date(ctx.clock.now())));
  const season = t.t(`season.${norm.season}`);
  return h('div', { class: 'fast-card' },
    h('p', {}, h('b', { class: 'big-num' }, String(latest.wcpm)), h('span', { class: 'muted' }, ` · ${t.t('fl.target', { season, target: norm.target })}`)),
    h('div', { class: 'meters' }, meter(`${latest.wcpm} / ${norm.target}`, Math.min(latest.wcpm, norm.target), norm.target)),
    reads.length > 1 ? h('p', { class: 'muted small' }, reads.slice(0, 8).reverse().map((r) => `${r.wcpm}`).join(' → ')) : null);
}

function fastCard(ctx: AppContext, p: Profile): HTMLElement {
  const t = ctx.i18n;
  const scores = p.fast ?? [];
  const last = scores.at(-1);
  return h('div', { class: 'fast-card' },
    h('h3', {}, t.t('sum.fast')),
    last
      ? h('div', {},
        h('p', {}, h('b', { class: 'big-num' }, String(last.score)), h('span', { class: 'muted' }, ` · ${last.date}`)),
        h('p', { class: 'muted' }, t.t('sum.fastGoal', { min: FAST_GRADE1_LEVEL3.min, max: FAST_GRADE1_LEVEL3.max })),
        h('p', {}, last.score >= FAST_GRADE1_LEVEL3.min ? t.t('sum.fastMet') : t.t('sum.fastGap', { n: FAST_GRADE1_LEVEL3.min - last.score })),
        scores.length > 1 ? h('p', { class: 'muted small' }, scores.map((s) => `${s.date}: ${s.score}`).join(' → ')) : null)
      : h('p', { class: 'muted' }, t.t('sum.fastNone')));
}
