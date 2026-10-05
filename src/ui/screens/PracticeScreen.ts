import { STORY_SKILLS, TOPICS, encodeChoice, type Topic, type TopicChoice, type TopicGroup } from '@domain/practice/Topics';
import { recommendTopic, topicStat } from '@domain/practice/Recommend';
import { standardStats } from '@domain/standards/Standards';
import { rebuildDeck } from '@domain/srs/Leitner';
import type { Profile } from '@domain/profiles/Profile';
import type { StorySkill } from '@domain/content/types';
import { homeworkSkill } from '@domain/session/SessionPlanner';
import type { PracticeEvent } from '@domain/storage/events';
import type { AppContext, Screen } from '../context';
import { h, replace } from '../dom';

const GROUPS: readonly TopicGroup[] = ['sounds', 'phonics', 'sight', 'fluency', 'stories', 'vocab', 'writing'];
const HOMEWORK_DAYS = 7;

/**
 * "Practice a skill": the grown-up picks a topic, organized by Florida B.E.S.T. benchmark, with his
 * accuracy on each and one recommendation. The automatic daily plan stays the default (Kick off).
 */
export class PracticeScreen implements Screen {
  constructor(private readonly ctx: AppContext) {}

  async render(host: HTMLElement): Promise<void> {
    const p = this.ctx.player();
    if (!p) { this.ctx.navigate('players'); return; }
    const { i18n: t, library, clock } = this.ctx;
    const events = await this.ctx.log.events(p.id);
    const stats = standardStats(events, library);
    const recommended = recommendTopic(stats);
    const today = clock.today();
    const when = (day: number): string => (day === today ? t.t('sum.today2') : t.t('sum.daysAgo', { n: today - day }));

    const card = (topicDef: Topic): HTMLElement => {
      const s = topicStat(topicDef, stats);
      const pct = s.attempts ? Math.round((s.correct / s.attempts) * 100) : 0;
      return h('button', { class: `topic-card ${topicDef.id === recommended ? 'rec' : ''}`, onClick: () => void this.choose(p, topicDef, events) },
        h('span', { class: 'tc-head' }, h('span', { class: 'tc-icon', 'aria-hidden': 'true' }, topicDef.icon), h('b', { lang: 'en' }, topicDef.title)),
        topicDef.id === recommended ? h('span', { class: 'tc-badge' }, t.t('pr.recommended')) : null,
        topicDef.review ? h('span', { class: 'tc-badge k' }, t.t('pr.kReview')) : null,
        h('span', { class: 'tc-desc' }, t.t(`topic.${topicDef.id}`)),
        h('span', { class: 'tc-codes' }, topicDef.benchmarks.join(' · ')),
        h('span', { class: `tc-stat ${s.attempts && pct < 80 ? 'weak' : ''}` }, s.attempts ? t.t('pr.stat', { pct, n: s.attempts, when: when(s.lastDay) }) : t.t('pr.new')));
    };

    const review = h('input', { type: 'checkbox', checked: p.settings.topicReview !== false, onChange: async (e: Event) => {
      await this.save(p, { topicReview: (e.target as HTMLInputElement).checked });
    } });
    const hw = homeworkSkill(p.settings, today);
    const homework = h('select', { onChange: async (e: Event) => {
      const v = (e.target as HTMLSelectElement).value as StorySkill | '';
      await this.save(p, { homework: v ? { skill: v, until: today + HOMEWORK_DAYS - 1 } : undefined });
    } }, h('option', { value: '' }, t.t('pr.homeworkNone')),
    STORY_SKILLS.map((sk) => h('option', { value: sk, selected: sk === hw }, t.t(`skill.${sk}`))));

    replace(host, h('div', { class: 'screen parent practice', lang: t.locale },
      h('div', { class: 'row between' }, h('h1', {}, t.t('pr.title')), h('button', { class: 'btn small', onClick: () => this.ctx.navigate('home') }, t.t('pr.back'))),
      h('p', { class: 'muted' }, t.t('pr.intro')),
      h('label', { class: 'choice-row' }, review, h('span', {}, t.t('pr.review'))),
      h('div', { class: 'homework-row' }, h('label', {}, h('b', {}, t.t('pr.homework')), homework), h('p', { class: 'small muted' }, t.t('pr.homeworkHelp'))),
      GROUPS.map((g) => h('section', { class: 'topic-group' }, h('h3', {}, t.t(`group.${g}`)),
        h('div', { class: 'topic-grid' }, TOPICS.filter((x) => x.group === g).map(card))))));
  }

  /** Unit or skill choice when the topic needs one, then start the session. */
  private async choose(p: Profile, topicDef: Topic, events: PracticeEvent[]): Promise<void> {
    const { i18n: t, library, planner } = this.ctx;
    if (!topicDef.needs) { this.start({ topic: topicDef.id }); return; }
    const sheet = h('div', { class: 'gate sheet' });
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, sheet);
    const close = (): void => overlay.remove();
    if (topicDef.needs === 'unit') {
      const deck = rebuildDeck(events);
      const current = planner.currentUnit(library, deck, p.settings.startUnit);
      replace(sheet, h('h2', {}, t.t('pr.pickUnit')),
        h('div', { class: 'unit-list' }, library.units.map((u) => {
          const status = u.order === current ? t.t('pr.unitNow') : u.order > current ? t.t('pr.unitAhead') : t.t('pr.unitDone');
          return h('button', { class: `unit-btn ${u.order > current ? 'ahead' : ''}`, onClick: () => { close(); this.start({ topic: 'phonics', unit: u.order }); } },
            h('b', {}, `${u.order}. ${u.title}`), h('span', { class: 'small muted' }, status));
        })),
        h('button', { class: 'btn link', onClick: close }, t.t('pr.cancel')));
    } else {
      const alsoHomework = h('input', { type: 'checkbox' });
      replace(sheet, h('h2', {}, t.t('pr.pickSkill')),
        h('div', { class: 'unit-list' }, STORY_SKILLS.map((sk) => h('button', { class: 'unit-btn', onClick: async () => {
          if ((alsoHomework as HTMLInputElement).checked) await this.save(p, { homework: { skill: sk, until: this.ctx.clock.today() + HOMEWORK_DAYS - 1 } });
          close();
          this.start({ topic: 'story', skill: sk });
        } }, h('b', {}, t.t(`skill.${sk}`))))),
        h('label', { class: 'choice-row' }, alsoHomework, h('span', {}, t.t('pr.useHomework'))),
        h('button', { class: 'btn link', onClick: close }, t.t('pr.cancel')));
    }
    document.body.appendChild(overlay);
  }

  private start(choice: TopicChoice): void {
    this.ctx.navigate('session', { topic: encodeChoice(choice) });
  }

  private async save(p: Profile, settings: Partial<Profile['settings']>): Promise<void> {
    const next: Profile = { ...p, settings: { ...p.settings, ...settings } };
    await this.ctx.profiles.save(next);
    this.ctx.setPlayer(next);
    void this.ctx.sync.sync();
  }
}
