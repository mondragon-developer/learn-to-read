import type { I18n } from '@domain/i18n/i18n';
import { h } from '../dom';

const HOLD_MS = 3000;

/**
 * Parent gate: hold a button for 3 seconds, then answer a sum a first grader can't do yet.
 * Resolves true when passed, false when cancelled.
 */
export function parentGate(i18n: I18n): Promise<boolean> {
  return new Promise((resolve) => {
    const a = 6 + Math.floor(Math.random() * 7);
    const b = 7 + Math.floor(Math.random() * 6);
    const answer = a * b;
    const close = (ok: boolean): void => { overlay.remove(); resolve(ok); };
    const ring = h('span', { class: 'hold-fill' });
    const hold = h('button', { class: 'btn big hold' }, ring, h('span', {}, i18n.t('gate.hold')));
    const body = h('div', { class: 'gate-body' }, h('p', {}, i18n.t('gate.intro')), hold);
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': i18n.t('gate.title') },
      h('div', { class: 'gate' }, h('h2', {}, `🔒 ${i18n.t('gate.title')}`), body,
        h('button', { class: 'btn link', onClick: () => close(false) }, i18n.t('gate.cancel'))));
    document.body.appendChild(overlay);

    let timer: number | undefined;
    const start = (): void => {
      hold.classList.add('holding');
      timer = window.setTimeout(() => {
        // Typed answer, not multiple choice: a child tapping at random would get in 1 time in 3.
        const input = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '3', autocomplete: 'off', class: 'gate-input', 'aria-label': i18n.t('gate.sum', { a, b }) });
        const submit = (): void => close(Number(input.value.trim()) === answer);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        body.replaceChildren(
          h('p', {}, i18n.t('gate.sum', { a, b })),
          h('div', { class: 'row center' }, input, h('button', { class: 'btn big ok', onClick: submit }, 'OK')));
        input.focus();
      }, HOLD_MS);
    };
    const stop = (): void => { hold.classList.remove('holding'); window.clearTimeout(timer); };
    hold.addEventListener('pointerdown', start);
    hold.addEventListener('pointerup', stop);
    hold.addEventListener('pointerleave', stop);
    hold.addEventListener('pointercancel', stop);
  });
}

const QUICK_HOLD_MS = 1500;

/**
 * Short gate for grown-up shortcuts on the child's screens: press and hold 1.5 s. It only
 * keeps him from wandering in by accident; the parent area keeps the full gate.
 */
export function quickGate(i18n: I18n): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (ok: boolean): void => { overlay.remove(); resolve(ok); };
    const hold = h('button', { class: 'btn big hold quick' }, h('span', { class: 'hold-fill' }), h('span', {}, i18n.t('gate.quick')));
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': i18n.t('gate.quick') },
      h('div', { class: 'gate' }, hold, h('button', { class: 'btn link', onClick: () => close(false) }, i18n.t('gate.cancel'))));
    document.body.appendChild(overlay);
    let timer: number | undefined;
    hold.addEventListener('pointerdown', () => { hold.classList.add('holding'); timer = window.setTimeout(() => close(true), QUICK_HOLD_MS); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(ev, () => { hold.classList.remove('holding'); window.clearTimeout(timer); });
  });
}
