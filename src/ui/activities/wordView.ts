import type { Card } from '@domain/content/ContentLibrary';
import { clipKey } from '@domain/audio/AudioCatalog';
import type { AudioPort } from '@domain/audio/AudioPort';
import { h, sleep } from '../dom';

/** The word in big school print. Heart words mark the part we learn "by heart". */
export function wordView(card: Card): HTMLElement {
  const text = card.text;
  const part = card.heartPart?.toLowerCase();
  const at = part ? text.toLowerCase().indexOf(part) : -1;
  if (card.kind === 'heart' && part && at >= 0) {
    return h('div', { class: 'word', 'aria-label': text },
      text.slice(0, at), h('span', { class: 'heart-part' }, text.slice(at, at + part.length)), text.slice(at + part.length));
  }
  return h('div', { class: 'word', 'aria-label': text }, text);
}

/** Letter tiles, one per sound ('sh' is one tile). Tap a tile to hear its sound. */
export function soundTiles(card: Card, audio: AudioPort): { el: HTMLElement; play: () => Promise<void> } {
  const graphemes = card.graphemes ?? [...card.text];
  const tiles = graphemes.map((g) => h('button', { class: 'tile', onClick: () => void audio.play(clipKey.sound(g)) }, g.replace('_e', '…e')));
  const el = h('div', { class: 'tiles', role: 'group', 'aria-label': `Sounds in ${card.text}` }, tiles);
  const play = async (): Promise<void> => {
    for (let i = 0; i < tiles.length; i++) {
      tiles[i]?.classList.add('lit');
      await audio.play(clipKey.sound(graphemes[i] as string));
      await sleep(150);
      tiles[i]?.classList.remove('lit');
    }
    el.classList.add('sweep');
    await audio.play(clipKey.word(card.text));
    el.classList.remove('sweep');
  };
  return { el, play };
}

/**
 * Challenge words split into syllables (ro·bin). Tapping a part plays the word slowly; play()
 * lights each part in turn while the word is said slowly, then says it at normal speed.
 */
export function syllableTiles(card: Card, audio: AudioPort): { el: HTMLElement; play: () => Promise<void> } {
  const parts = card.syllables ?? [card.text];
  const slow = (): Promise<void> => audio.play(clipKey.slow(card.text));
  const tiles = parts.map((p) => h('button', { class: 'tile syllable', onClick: () => void slow() }, p));
  const el = h('div', { class: 'tiles syllables', role: 'group', 'aria-label': `Parts of ${card.text}` }, tiles);
  const play = async (): Promise<void> => {
    for (const t of tiles) { t.classList.add('lit'); await sleep(450); t.classList.remove('lit'); }
    await slow();
    el.classList.add('sweep');
    await audio.play(clipKey.word(card.text));
    el.classList.remove('sweep');
  };
  return { el, play };
}

/** Reward picture: shown only AFTER a correct read (Florida bans picture cues before reading). */
export function rewardBurst(host: HTMLElement, reward?: string): void {
  if (!reward) return;
  const el = h('div', { class: 'reward-burst', 'aria-hidden': 'true' }, reward);
  host.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}
