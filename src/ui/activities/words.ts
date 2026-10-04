import type { Card } from '@domain/content/ContentLibrary';
import { clipKey } from '@domain/audio/AudioCatalog';
import type { Outcome, Source } from '@domain/storage/events';
import type { Kit } from './kit';
import { h, replace, sleep } from '../dom';
import { rewardBurst, soundTiles, syllableTiles, wordView } from './wordView';
import { coachBar, coachSentence } from './readingCoach';
import { Transport } from './transport';
import { sentenceMeta, sentenceOutcome } from '@domain/reading/SentenceCheck';

const SAY_TIMES = 3;

/**
 * New word (or challenge word): hear it, see its sounds (or syllables), then say it three times,
 * each one a kick. ELA.1.F.1.3, F.1.3.e, F.1.4.a
 */
export async function newWord(kit: Kit, host: HTMLElement, card: Card): Promise<void> {
  const id = card.kind === 'challenge' ? 'challenge' : 'new-word';
  await kit.intro(host, id);
  const panel = h('div', { class: 'panel' });
  const kicks = Array.from({ length: SAY_TIMES }, () => h('span', { class: 'kick' }, '⚽'));
  const kickLabel = h('p', { class: 'small muted kick-label' }, `Say it ${SAY_TIMES} times`);
  const parts = card.kind === 'challenge' ? syllableTiles(card, kit.ctx.audio) : card.kind === 'decodable' ? soundTiles(card, kit.ctx.audio) : null;
  const stage = h('div', { class: 'stage' },
    kit.header(id, card.kind === 'heart' ? 'Heart word ❤️' : undefined, true),
    wordView(card),
    parts?.el,
    h('div', { class: 'kicks', 'aria-label': `Say it ${SAY_TIMES} times` }, kicks),
    kickLabel,
    panel);
  replace(host, stage);

  if (card.kind === 'heart') await kit.prompt('heart-word');
  if (parts) {
    await kit.prompt(card.kind === 'challenge' ? 'listen' : 'sound-it-out');
    await parts.play();
  } else {
    await kit.word(card.text);
  }

  let first: { outcome: Outcome; source: Source } | null = null;
  for (let i = 0; i < SAY_TIMES; i++) {
    kickLabel.textContent = `Say it ${SAY_TIMES} times: ${i + 1} of ${SAY_TIMES}`;
    const r = await kit.reader.readWord(panel, card.text, i === 0 ? 'Say it!' : 'Again!');
    first ??= r;
    if (r.outcome !== 'missed') {
      kicks[i]?.classList.add('scored');
      if (i === 0) rewardBurst(stage, card.reward);
    }
  }
  if (first) await kit.record('new-word', card.id, first.outcome, first.source);
}

/** Review: read a due card cold. "Help" plays the separate sounds (never the whole word). */
export async function review(kit: Kit, host: HTMLElement, card: Card): Promise<void> {
  await kit.intro(host, 'review');
  const panel = h('div', { class: 'panel' });
  let helped = false;
  const help = card.kind === 'decodable' || card.kind === 'challenge'
    ? h('button', { class: 'btn link', onClick: async () => {
      helped = true;
      if (card.syllables) { await kit.say(clipKey.slow(card.text)); return; }
      for (const g of card.graphemes ?? []) { await kit.say(clipKey.sound(g)); await sleep(120); }
    } }, card.syllables ? '🐢 Help: hear it slowly' : '🧩 Help: the sounds')
    : null;
  const stage = h('div', { class: 'stage' }, kit.header('review'), wordView(card), help, panel);
  replace(host, stage);
  const r = await kit.reader.readWord(panel, card.text);
  const outcome: Outcome = helped && r.outcome === 'first-try' ? 'after-retry' : r.outcome;
  if (outcome !== 'missed') { rewardBurst(stage, card.reward); await kit.prompt('goal'); }
  await kit.record('review', card.id, outcome, r.source, r.heard ? { heard: r.heard } : undefined);
}

/**
 * Read a decodable sentence with the reading coach: listen word by word, listen whole, then he
 * reads it word by word and whole while the grown-up checks. Tap any word to hear it. ELA.1.F.1.4
 */
export async function sentence(kit: Kit, host: HTMLElement, text: string, itemId: string, modelKey: string): Promise<void> {
  await kit.intro(host, 'sentence');
  const chips = text.split(/\s+/).map((t) => h('button', { class: 'chip', onClick: () => void kit.word(t.replace(/[^A-Za-z']/g, '')) }, t));
  const panel = h('div', { class: 'panel' });
  const transport = new Transport(kit.ctx.audio);
  const bar = coachBar(transport);
  replace(host, h('div', { class: 'stage' }, kit.header('sentence'), h('div', { class: 'sentence' }, chips), h('div', { class: 'coach-dock' }, panel, bar.el)));
  const r = await coachSentence(kit, transport, bar, chips, panel, text, modelKey);
  if (!r) return;
  if (sentenceOutcome(r.check) !== 'missed') await kit.prompt('great-read');
  await kit.record('sentence', itemId, sentenceOutcome(r.check), r.source, sentenceMeta(r.check));
}
