import type { AppContext } from '../context';
import { h } from '../dom';

/** Ayuda: daily routine, install, Guided Access, mic, Florida note, audio review link. */
export function helpSection(ctx: AppContext): HTMLElement {
  const { i18n: t } = ctx;
  return h('div', { class: 'parent-section' },
    h('h3', {}, t.t('help.title')),
    h('ul', { class: 'help' }, ['daily', 'install', 'guided', 'mic', 'never', 'florida'].map((k) => h('li', {}, t.t(`help.${k}`)))),
    h('button', { class: 'btn soft', onClick: () => ctx.navigate('audio-review') }, `🔊 ${t.t('help.audio')}`));
}
