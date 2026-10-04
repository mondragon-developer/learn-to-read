import { DEFAULT_SETTINGS, JERSEY_COLORS, PROFILE_SCHEMA, type Profile } from '@domain/profiles/Profile';
import { newEventId } from '@domain/storage/events';
import type { AppContext } from '../context';
import { h } from '../dom';

/** Jugadores: list and create (first name only). */
export function playersSection(ctx: AppContext, players: Profile[], onCreated: (p: Profile) => void): HTMLElement {
  const { i18n: t } = ctx;
  const name = h('input', { type: 'text', maxlength: '20', autocomplete: 'off', placeholder: 'Leo' });
  const create = async (): Promise<void> => {
    const first = name.value.trim();
    if (!first) { name.focus(); return; }
    const now = ctx.clock.now();
    const p: Profile = {
      v: PROFILE_SCHEMA, id: newEventId(), firstName: first, color: JERSEY_COLORS[players.length % JERSEY_COLORS.length] as string,
      number: 10, createdAt: now, updatedAt: now, settings: { ...DEFAULT_SETTINGS },
    };
    await ctx.profiles.save(p);
    void ctx.sync.sync();
    ctx.setPlayer(p);
    onCreated(p);
  };
  return h('div', { class: 'parent-section form' },
    players.length ? h('ul', {}, players.map((p) => h('li', {}, h('span', { class: 'jersey', style: `background:${p.color}` }, String(p.number)), ` ${p.firstName}`))) : h('p', {}, t.t('parent.noPlayers')),
    h('fieldset', {}, h('legend', {}, t.t('players.add')),
      h('label', {}, t.t('set.name'), name), h('p', { class: 'muted small' }, t.t('players.hint')),
      h('button', { class: 'btn big ok', onClick: () => void create() }, t.t('players.create'))));
}
