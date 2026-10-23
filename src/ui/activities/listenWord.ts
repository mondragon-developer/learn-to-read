import type { Kit } from './kit';
import { h } from '../dom';

/** The touch strip is below the print, keeping the child's finger off the word. */
export function listenWord(kit: Kit, text: string, className: 'w' | 'chip'): HTMLElement {
  const letters = h('span', { class: 'word-letters' }, text);
  const button = h('button', { class: `${className} listen-word`, 'aria-label': `Hear ${text.replace(/[^A-Za-z']/g, '')}` }, letters);
  button.addEventListener('click', (event) => {
    // Keyboard activation remains available; pointer users tap the space below the letters.
    if (event.detail !== 0 && event.clientY < letters.getBoundingClientRect().bottom + 3) return;
    if (kit.closed || kit.isPaused) return;
    button.closest('.line, .sentence')?.querySelectorAll('.word-replay').forEach((word) => word.classList.remove('word-replay'));
    button.classList.add('word-replay');
    kit.narrate(async (voice) => {
      button.classList.add('word-listening');
      try { await voice.word(text.replace(/[^A-Za-z']/g, '')); }
      finally { button.classList.remove('word-listening'); }
    });
  });
  return button;
}
