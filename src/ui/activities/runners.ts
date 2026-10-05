import type { Step } from '@domain/session/SessionPlanner';
import { clipKey } from '@domain/audio/AudioCatalog';
import type { Kit } from './kit';
import { newWord, review, sentence } from './words';
import { warmup } from './warmup';
import { story } from './story';
import { write } from './write';
import { spelling, tricky } from './games';
import { fluency } from './fluency';

type Runner<K extends Step['kind']> = (kit: Kit, stage: HTMLElement, step: Extract<Step, { kind: K }>) => Promise<void>;

/**
 * One runner per step kind. A new activity = a new Step kind in SessionPlanner + one entry here;
 * the compiler refuses to build until every kind has a runner.
 */
export const RUNNERS: { [K in Step['kind']]: Runner<K> } = {
  warmup: async (kit, stage, step) => {
    const unit = kit.ctx.library.unit(step.unit);
    if (unit) await warmup(kit, stage, step.game, unit, kit.ctx.library.units, step.rounds);
  },
  review: (kit, stage, step) =>
    review(kit, stage, kit.ctx.library.card(step.cardId) ?? kit.ctx.library.storyCard(step.cardId.slice(2))),
  'new-word': async (kit, stage, step) => {
    const card = kit.ctx.library.card(step.cardId);
    if (!card) return;
    await newWord(kit, stage, card);
    kit.known.add(card.id);
  },
  write: async (kit, stage, step) => {
    const card = kit.ctx.library.card(step.cardId);
    if (card) await write(kit, stage, card, step.mode);
  },
  sentence: async (kit, stage, step) => {
    const unit = kit.ctx.library.unit(step.unit);
    const text = unit?.sentences[step.index];
    if (unit && text) await sentence(kit, stage, text, `${unit.id}:s${step.index}`, clipKey.sentence(unit.id, step.index));
  },
  story: async (kit, stage, step) => {
    const s = kit.ctx.library.story(step.storyId);
    if (s) await story(kit, stage, s);
  },
  fluency: async (kit, stage, step) => {
    const lib = kit.ctx.library;
    const s = step.storyId ? lib.story(step.storyId) : undefined;
    // No decodable story at his level yet: the sentences of his units make the passage.
    const passage = s ?? { id: `u${step.unit}:sentences`, title: 'Read my sentences', sentences: lib.units.filter((u) => u.order <= step.unit).flatMap((u) => u.sentences).slice(-8) };
    await fluency(kit, stage, { id: passage.id, title: passage.title, sentences: passage.sentences });
  },
  game: async (kit, stage, step) => {
    const unit = kit.ctx.library.unit(step.unit);
    if (!unit) return;
    if (step.game === 'tricky') await tricky(kit, stage, unit, kit.ctx.library.units);
    else await spelling(kit, stage, unit);
  },
};

export function runStep(kit: Kit, stage: HTMLElement, step: Step): Promise<void> {
  return (RUNNERS[step.kind] as Runner<typeof step.kind>)(kit, stage, step as never);
}
