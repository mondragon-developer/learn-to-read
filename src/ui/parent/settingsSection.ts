import type { Profile } from '@domain/profiles/Profile';
import { JERSEY_COLORS } from '@domain/profiles/Profile';
import type { SessionMinutes, WritingMode } from '@domain/session/SessionPlanner';
import type { AppContext } from '../context';
import { h, replace, toast } from '../dom';

/** Ajustes: session length, writing mode, mic, start unit, jersey, school FAST scores. */
export function settingsSection(ctx: AppContext, p: Profile, refresh: () => void): HTMLElement {
  const { i18n: t, library } = ctx;
  const draft: Profile = structuredClone(p);
  const radio = <T extends string | number>(name: string, value: T, label: string, current: T, set: (v: T) => void): HTMLElement =>
    h('label', { class: 'choice-row' }, h('input', { type: 'radio', name, value: String(value), checked: value === current, onChange: () => set(value) }), h('span', {}, label));
  const name = h('input', { type: 'text', value: draft.firstName, maxlength: '20', autocomplete: 'off' });
  const number = h('input', { type: 'number', value: String(draft.number), min: '0', max: '99' });
  const fastDate = h('input', { type: 'date' });
  const fastScore = h('input', { type: 'number', min: '300', max: '1100', placeholder: '800' });
  const fastList = h('ul', { class: 'muted' }, (draft.fast ?? []).map((f) => h('li', {}, `${f.date}: ${f.score}`)));
  const save = async (): Promise<void> => {
    draft.firstName = name.value.trim() || draft.firstName;
    draft.number = Math.max(0, Math.min(99, Number(number.value) || 0));
    await ctx.profiles.save(draft);
    if (ctx.player()?.id === draft.id) ctx.setPlayer({ ...draft });
    void ctx.sync.sync();
    toast(t.t('set.saved'));
    refresh();
  };
  const voice = h('select', { 'aria-label': t.t('set.voice'), onChange: () => { draft.settings.voice = voice.value; } });
  const updateVoices = (): void => {
    const options = ctx.audio.voices?.() ?? [{ id: 'teacher', label: 'Teacher — Fish Audio' }];
    const selected = draft.settings.voice ?? 'teacher';
    replace(voice, options.map((v) => h('option', { value: v.id, selected: v.id === selected }, v.label)));
    if (!options.some((v) => v.id === selected)) voice.appendChild(h('option', { value: selected, selected: true }, t.t('set.voiceUnavailable')));
  };
  updateVoices();
  // Safari may populate installed voices only after the first audio gesture. Refresh on focus.
  voice.addEventListener('focus', updateVoices);
  return h('div', { class: 'parent-section form' },
    h('button', { class: 'btn big ok', onClick: async () => {
      draft.settings = { ...draft.settings, checkMode: 'independent', storyReading: 'sentences', minutes: 5, writing: 'trace', challenge: false };
      await save();
    } }, t.t('set.independentPreset')),
    h('p', { class: 'muted small' }, t.t('set.independentHelp')),
    h('fieldset', {}, h('legend', {}, t.t('set.minutes')),
      ([5, 10, 15] as SessionMinutes[]).map((m) => radio('minutes', m, t.t(`set.minutes${m}`), draft.settings.minutes, (v) => { draft.settings.minutes = v; }))),
    h('fieldset', {}, h('legend', {}, t.t('set.writing')),
      (['off', 'trace', 'free', 'tiles'] as WritingMode[]).map((m) => radio('writing', m, t.t(`set.writing.${m}`), draft.settings.writing, (v) => { draft.settings.writing = v; }))),
    h('fieldset', {}, h('legend', {}, t.t('set.check')),
      (['independent', 'record', 'mic'] as const).map((m) => radio('check', m, t.t(`set.check.${m}`), draft.settings.checkMode ?? 'record', (v) => { draft.settings.checkMode = v; })),
      h('p', { class: 'muted small' }, t.t('set.checkHelp'))),
    h('fieldset', {}, h('legend', {}, t.t('set.storyReading')),
      (['sentences', 'coach'] as const).map((m) => radio('storyReading', m, t.t(`set.storyReading.${m}`), draft.settings.storyReading ?? 'sentences', (v) => { draft.settings.storyReading = v; })),
      h('p', { class: 'muted small' }, t.t('set.storyReadingHelp'))),
    h('fieldset', {}, h('legend', {}, t.t('set.voice')), voice,
      h('p', { class: 'muted small' }, t.t('set.voiceHelp')),
      h('button', { class: 'btn soft', onClick: async (event: Event) => {
        const button = event.currentTarget as HTMLButtonElement;
        button.disabled = true;
        const saved = ctx.player()?.settings.voice ?? 'teacher';
        ctx.audio.selectVoice?.(draft.settings.voice ?? 'teacher');
        try {
          await ctx.audio.unlock();
          if (button.isConnected) await ctx.audio.play('sentence:u01:0');
        } finally {
          if (button.isConnected) {
            ctx.audio.selectVoice?.(ctx.player()?.settings.voice ?? saved);
            button.disabled = false;
            updateVoices();
          }
        }
      } }, t.t('set.voicePreview'))),
    h('fieldset', {}, h('legend', {}, t.t('set.pace')),
      (['follow', 'word'] as const).map((m) => radio('pace', m, t.t(`set.pace.${m}`), draft.settings.readingPace ?? 'follow', (v) => { draft.settings.readingPace = v; }))),
    h('fieldset', {}, h('legend', {}, '🏆'),
      h('label', { class: 'choice-row' }, h('input', { type: 'checkbox', checked: draft.settings.challenge !== false, onChange: (e: Event) => { draft.settings.challenge = (e.target as HTMLInputElement).checked; } }), h('span', {}, t.t('set.challenge')))),
    h('fieldset', {}, h('legend', {}, t.t('set.startUnit')),
      h('select', { onChange: (e: Event) => { draft.settings.startUnit = Number((e.target as HTMLSelectElement).value); } },
        library.units.map((u) => h('option', { value: String(u.order), selected: u.order === draft.settings.startUnit }, `${u.order}. ${u.title}`))),
      h('p', { class: 'muted small' }, t.t('set.startUnitHelp'))),
    h('fieldset', {}, h('legend', {}, t.t('set.player')),
      h('label', {}, t.t('set.name'), name), h('label', {}, t.t('set.number'), number),
      h('div', { class: 'row' }, JERSEY_COLORS.map((c) => h('button', { class: `swatch ${c === draft.color ? 'on' : ''}`, style: `background:${c}`, 'aria-label': c, onClick: (e: Event) => {
        draft.color = c;
        (e.currentTarget as HTMLElement).parentElement?.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
        (e.currentTarget as HTMLElement).classList.add('on');
      } })))),
    h('fieldset', {}, h('legend', {}, t.t('set.fast')), fastList,
      h('div', { class: 'row' }, h('label', {}, t.t('set.fastDate'), fastDate), h('label', {}, t.t('set.fastScore'), fastScore),
        h('button', { class: 'btn small', onClick: () => {
          const score = Number(fastScore.value);
          if (!fastDate.value || !score) return;
          draft.fast = [...(draft.fast ?? []), { date: fastDate.value, score }].sort((a, b) => a.date.localeCompare(b.date));
          replace(fastList, draft.fast.map((f) => h('li', {}, `${f.date}: ${f.score}`)));
        } }, t.t('set.fastAdd')))),
    h('button', { class: 'btn big ok', onClick: () => void save() }, t.t('set.save')));
}
