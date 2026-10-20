import { KIT_COLORS, JERSEY_COLORS, type Profile } from '@domain/profiles/Profile';
import type { Kit } from './kit';
import { h, replace, svg } from '../dom';

/** Original vector player; jersey text is set via textContent, never interpolated markup. */
export const playerArt = (keeper = false): string => `
  <ellipse cy="8" rx="25" ry="7" fill="#113f34" opacity=".2"/>
  <path d="M-10-24L-13 2M10-24L15 2" stroke="#d69b70" stroke-width="9" stroke-linecap="round"/>
  <path class="soccer-shorts" d="M-18-30H18L17-12H3L0-22-3-12H-17Z" fill="#142e46"/>
  <path class="soccer-cleats" d="M-13 3h-8M15 3h8" stroke="#f8fafc" stroke-width="8" stroke-linecap="round"/>
  <path class="soccer-arms" d="M-15-51L-31-${keeper ? '43' : '28'}M15-51L31-${keeper ? '43' : '28'}" fill="none" stroke="#d69b70" stroke-width="9" stroke-linecap="round"/>
  ${keeper ? '<circle class="soccer-glove-left" cx="-33" cy="-43" r="8" fill="#fff"/><circle class="soccer-glove-right" cx="33" cy="-43" r="8" fill="#fff"/>' : ''}
  <path class="soccer-shirt" d="M-15-56Q0-62 15-56L19-26Q0-20-19-26Z" fill="${keeper ? '#ffd15b' : '#e96056'}"/>
  <circle cy="-72" r="15" fill="#d69b70"/>
  <path d="M-15-73Q-16-93 4-89Q18-87 16-73L8-79-12-77Z" fill="#263344"/>
  ${keeper ? '<circle cx="-5" cy="-70" r="1.7" fill="#263344"/><circle cx="5" cy="-70" r="1.7" fill="#263344"/><path d="M-4-65Q0-61 4-65" fill="none" stroke="#78452d" stroke-width="1.5"/>' :
    '<text class="soccer-name" y="-49" text-anchor="middle" fill="white" font-size="6" font-weight="bold"/><text class="soccer-number" y="-32" text-anchor="middle" fill="white" font-size="15" font-weight="bold"/>'}`;

export function dressPlayer(player: Element, profile: Profile): void {
  player.querySelector('.soccer-shirt')?.setAttribute('fill', profile.color);
  player.querySelector('.soccer-shorts')?.setAttribute('fill', profile.settings.shortsColor ?? '#142e46');
  player.querySelector('.soccer-cleats')?.setAttribute('stroke', profile.settings.cleatsColor ?? '#f8fafc');
  const name = player.querySelector('.soccer-name');
  if (name) {
    name.textContent = profile.firstName;
    name.setAttribute('font-size', String(Math.min(6, 48 / Math.max(1, profile.firstName.length))));
  }
  const number = player.querySelector('.soccer-number');
  if (number) number.textContent = String(profile.number);
}

/** Child-owned cosmetic choices, saved without changing parent-owned learning settings. */
export async function chooseSoccerKit(kit: Kit, host: HTMLElement): Promise<void> {
  const draft = structuredClone(kit.profile);
  const art = svg('0 0 160 140', `<g transform="translate(80 117) scale(1.2)">${playerArt()}</g>`, 'soccer-kit-preview');
  art.setAttribute('aria-hidden', 'true');
  const player = art.querySelector('g')!;
  const paint = (): void => dressPlayer(player, draft);
  paint();
  const number = h('input', { type: 'number', min: '0', max: '99', inputmode: 'numeric', value: String(draft.number), 'aria-label': 'Jersey number',
    onInput: () => { draft.number = clampNumber(number.value); paint(); } });
  const colorNames: Record<string, string> = { '#1F7A4D': 'Green', '#2D5BD0': 'Blue', '#D2462E': 'Red', '#E8A317': 'Gold', '#7A3FB8': 'Purple', '#0F8A8A': 'Teal', '#142e46': 'Navy', '#f8fafc': 'White', '#252525': 'Black', '#f68b36': 'Orange' };
  const swatches = (label: string, colors: readonly string[], current: () => string, set: (color: string) => void): HTMLElement => {
    const buttons = colors.map((color) => h('button', { class: 'swatch', style: `background:${color}`, 'aria-label': `${label}: ${colorNames[color] ?? color}`, onClick: () => {
      set(color); paint(); update();
    } }));
    const update = (): void => buttons.forEach((b, i) => {
      b.classList.toggle('on', current() === colors[i]);
      b.setAttribute('aria-pressed', String(current() === colors[i]));
    });
    update();
    return h('fieldset', { class: 'soccer-kit-colors' }, h('legend', {}, label), h('div', { class: 'row center' }, buttons));
  };
  await new Promise<void>((resolve) => {
    const message = h('p', { class: 'small', role: 'status' });
    const start = h('button', { class: 'btn big ok kit-start', onClick: async () => {
      if (start.disabled || kit.closed) return;
      start.disabled = true;
      draft.number = clampNumber(number.value);
      const next = { ...kit.profile, color: draft.color, number: draft.number,
        settings: { ...kit.profile.settings, shortsColor: draft.settings.shortsColor, cleatsColor: draft.settings.cleatsColor } };
      try {
        await kit.ctx.profiles.save(next);
        if (kit.closed) return;
        Object.assign(kit.profile, next);
        kit.ctx.setPlayer(next);
        void kit.ctx.sync.sync();
        resolve();
      } catch {
        if (!kit.closed) { start.disabled = false; message.textContent = 'Couldn’t save your kit. Please try again.'; }
      }
    } }, '⚽ Let’s play!');
    replace(host, h('div', { class: 'stage soccer-kit' }, h('h2', {}, 'Pick your match kit!'),
      art, h('label', { class: 'soccer-kit-number' }, 'Your number', number),
      swatches('Jersey', JERSEY_COLORS, () => draft.color, (v) => { draft.color = v; }),
      swatches('Shorts', KIT_COLORS, () => draft.settings.shortsColor ?? '#142e46', (v) => { draft.settings.shortsColor = v; }),
      swatches('Cleats', KIT_COLORS, () => draft.settings.cleatsColor ?? '#f8fafc', (v) => { draft.settings.cleatsColor = v; }),
      message, start));
  });
}

const clampNumber = (value: string): number => Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
