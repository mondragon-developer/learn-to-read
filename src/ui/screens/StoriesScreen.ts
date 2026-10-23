import { clipKey } from '@domain/audio/AudioCatalog';
import { readBookmark, saveBookmark } from '@domain/content/StoryBookmark';
import type { Story } from '@domain/content/types';
import { tokenize } from '@domain/content/Decodability';
import { newEventId } from '@domain/storage/events';
import type { AppContext, NavParams, Screen } from '../context';
import { h, replace } from '../dom';
import { Kit } from '../activities/kit';
import { storyActivities } from '../activities/story';

/** A quiet, child-led library. Listening never creates a reading assessment. */
export class StoriesScreen implements Screen {
  private host!: HTMLElement;
  private current: Story | null = null;
  private mode: 'listen' | 'read' = 'listen';
  private sentence = 0;
  private playing = false;
  private finished = false;
  private epoch = 0;
  private closed = true;
  private kit: Kit | null = null;
  private status: HTMLElement | null = null;
  private playButton: HTMLButtonElement | null = null;
  private lines: HTMLElement[] = [];
  private visibility = (): void => { if (document.hidden) this.stop(); };

  render(host: HTMLElement, params?: NavParams): void {
    this.host = host;
    this.closed = false;
    if (!this.ctx.player()) { this.ctx.navigate('players'); return; }
    document.addEventListener('visibilitychange', this.visibility);
    const selected = params?.storyId ? this.ctx.library.story(params.storyId) : null;
    if (selected) this.open(selected, 'listen'); else this.library();
  }
  constructor(private readonly ctx: AppContext) {}

  private library(): void {
    this.stop();
    this.kit?.cancel(); this.kit = null;
    this.current = null;
    const p = this.ctx.player()!;
    const bookmark = readBookmark(p.id);
    const last = bookmark && this.ctx.library.story(bookmark.storyId);
    const cards = (stories: Story[]): HTMLElement => h('div', { class: 'story-shelf' }, stories.map((s) =>
      h('article', { class: 'story-card' },
        h('span', { class: 'tag' }, s.theme ?? 'Read together'),
        h('h3', {}, s.title),
        h('p', { class: 'small muted' }, `${s.genre === 'biography' ? `About ${s.player}` : s.genre === 'fiction' ? 'An original soccer tale' : 'A reading story'} · ${s.sentences.length} sentences`),
        h('div', { class: 'row' },
          h('button', { class: 'btn ok', 'aria-label': `Listen to ${s.title}`, onClick: () => { this.open(s, 'listen'); void this.play(true); } }, '🔊 Listen'),
          h('button', { class: 'btn soft', 'aria-label': `Read ${s.title} together`, onClick: () => this.open(s, 'read') }, '📖 Read together')))));
    replace(this.host, h('div', { class: 'screen story-library' },
      h('div', { class: 'row between' }, h('h1', {}, 'Soccer Story Time'), h('button', { class: 'btn soft', onClick: () => this.ctx.navigate('home') }, 'Home')),
      h('p', { class: 'lead' }, 'A little story before bed, or anytime. Choose one to hear or read.'),
      last && bookmark ? h('button', { class: 'btn big story-continue', onClick: () => this.open(last, bookmark.mode, bookmark.sentence) }, `Continue your story: ${last.title}`) : null,
      h('h2', {}, 'Little stories. Big dreams.'), cards(this.ctx.library.stories.filter((s) => s.collection === 'soccer')),
      h('details', {}, h('summary', {}, 'More reading stories'), cards(this.ctx.library.stories.filter((s) => s.collection !== 'soccer')))));
  }

  private open(s: Story, mode: 'listen' | 'read', sentence = 0): void {
    this.stop(); this.kit?.cancel(); this.kit = null;
    this.current = s; this.mode = mode;
    this.finished = false;
    this.sentence = Math.max(0, Math.min(sentence, s.sentences.length - 1));
    this.remember();
    this.paint();
  }

  private paint(): void {
    const s = this.current!;
    this.lines = s.sentences.map((text, index) => {
      const words = text.split(/\s+/).map((word) => h('button', { class: 'w', 'aria-label': `Hear ${word}`, onClick: async () => {
        this.stop();
        const token = this.epoch;
        await this.ctx.audio.unlock();
        if (token === this.epoch && !this.closed) await this.ctx.audio.sequence(tokenize(word).map(clipKey.word), 60);
      } }, word));
      return h('p', { class: 'line story-time-line', 'data-sentence': String(index), hidden: this.mode === 'read' && index !== this.sentence }, words.flatMap((word, i) => i ? [' ', word] : [word]));
    });
    this.status = h('p', { class: 'small', role: 'status' }, this.mode === 'read' ? `Sentence ${this.sentence + 1} of ${s.sentences.length}` : 'Listen at your own pace.');
    this.playButton = h('button', { class: 'btn ok story-time-play', onClick: () => { if (this.playing) this.stop(); else void this.play(false); } }, this.mode === 'listen' ? '🔊 Listen to the story' : '🔊 Hear the sentence');
    const change = (direction: number): void => {
      this.stop();
      this.sentence = Math.max(0, Math.min(s.sentences.length - 1, this.sentence + direction));
      this.remember(); this.paint();
    };
    const source = s.sources?.length ? h('details', { class: 'story-sources small' }, h('summary', {}, 'For grown-ups: story sources'),
      h('p', {}, 'An original short account based on these sources. The closing lesson is for discussion.'),
      s.sources.map((x) => h('p', {}, h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title)))) : null;
    replace(this.host, h('div', { class: 'screen story-time' },
      h('div', { class: 'row between' }, h('button', { class: 'btn soft', onClick: () => this.library() }, '← Choose another story'),
        h('button', { class: 'btn soft', onClick: () => this.ctx.navigate('home') }, 'Home')),
      h('span', { class: 'tag' }, s.genre === 'biography' ? `About ${s.player}` : s.genre === 'fiction' ? 'An original soccer tale' : 'Story Time'),
      h('h1', {}, s.title),
      h('div', { class: 'row center', 'aria-label': 'Story mode' },
        h('button', { class: 'btn soft', 'aria-pressed': String(this.mode === 'listen'), onClick: () => this.open(s, 'listen', this.sentence) }, 'Listen'),
        h('button', { class: 'btn soft', 'aria-pressed': String(this.mode === 'read'), onClick: () => this.open(s, 'read', this.sentence) }, 'Read together')),
      h('div', { class: 'book story-time-book' }, this.lines),
      h('div', { class: 'story-time-controls' }, this.status,
        h('div', { class: 'row center' }, this.playButton,
          h('button', { class: 'btn soft', onClick: () => { this.sentence = 0; this.remember(); this.paint(); void this.play(true); } }, '↺ Start again'),
          this.mode === 'read' ? h('button', { class: 'btn soft', disabled: this.sentence === 0, onClick: () => change(-1) }, '← Previous') : null,
          this.mode === 'read' ? h('button', { class: 'btn ok story-time-next', onClick: () => {
            if (this.sentence < s.sentences.length - 1) change(1); else { this.stop(); this.ending(); }
          } }, this.sentence < s.sentences.length - 1 ? 'Continue →' : 'Finish story') : null)),
      h('div', { class: 'story-time-ending' }), source));
  }

  private async play(withTitle: boolean): Promise<void> {
    this.stop();
    if (this.finished && this.mode === 'listen') { this.sentence = 0; withTitle = true; }
    this.finished = false;
    const token = this.epoch;
    const s = this.current;
    if (!s || this.closed) return;
    this.playing = true;
    if (this.playButton) this.playButton.textContent = '⏸ Pause';
    const active = (): boolean => token === this.epoch && !this.closed;
    try {
      await this.ctx.audio.unlock();
      if (!active()) return;
      if (withTitle) await this.ctx.audio.play(clipKey.story(s.id, 'title'));
      while (active() && this.sentence < s.sentences.length) {
        const index = this.sentence;
        this.remember();
        if (this.status) this.status.textContent = `Sentence ${index + 1} of ${s.sentences.length}`;
        const line = this.lines[index]!;
        line.classList.add('reading');
        const words = Array.from(line.querySelectorAll<HTMLElement>('.w'));
        await this.ctx.audio.follow(clipKey.story(s.id, String(index)), words.map((w) => w.textContent ?? ''), (i) => {
          if (active()) words.forEach((w, j) => w.classList.toggle('speaking', i === j));
        });
        line.classList.remove('reading'); words.forEach((w) => w.classList.remove('speaking'));
        if (!active()) return;
        if (this.mode === 'read') break;
        if (index === s.sentences.length - 1) { this.ending(); break; }
        this.sentence++;
      }
    } finally {
      if (active()) { this.playing = false; if (this.playButton) this.playButton.textContent = '🔊 Hear again'; }
    }
  }

  private ending(): void {
    const target = this.host.querySelector('.story-time-ending');
    if (!target || !this.current) return;
    this.finished = true;
    if (this.status) this.status.textContent = 'The end. Good reading, good dreaming.';
    replace(target, h('h2', {}, 'The end'), h('p', {}, 'You can finish here, or try the story activities.'),
      h('div', { class: 'row center' }, h('button', { class: 'btn ok', onClick: () => this.library() }, 'Choose another story'),
        h('button', { class: 'btn soft', onClick: () => void this.activities() }, 'Questions & activities'),
        h('button', { class: 'btn soft', onClick: () => this.ctx.navigate('home') }, 'Done for now')));
  }

  private async activities(): Promise<void> {
    this.stop();
    const s = this.current; const p = this.ctx.player();
    if (!s || !p) return;
    const kit = new Kit(this.ctx, p, newEventId(), () => undefined);
    this.kit = kit;
    const stage = h('div');
    replace(this.host, h('button', { class: 'btn soft', onClick: () => this.open(s, 'read', this.sentence) }, '← Back to the story'), stage);
    await kit.part(stage, (part, target) => storyActivities(part, target, s));
    if (!kit.closed && !this.closed) { kit.cancel(); this.kit = null; this.open(s, 'read', s.sentences.length - 1); this.ending(); }
  }

  private remember(): void {
    const p = this.ctx.player();
    if (p && this.current) saveBookmark(p.id, { storyId: this.current.id, sentence: this.sentence, mode: this.mode });
  }
  private stop(): void {
    this.epoch++; this.playing = false; this.ctx.audio.stop();
    this.lines.forEach((l) => { l.classList.remove('reading'); l.querySelectorAll('.speaking').forEach((w) => w.classList.remove('speaking')); });
    if (this.playButton) this.playButton.textContent = this.mode === 'read' ? '🔊 Hear the sentence' : '▶ Continue listening';
  }
  pause(): () => void { this.stop(); return this.kit?.pause() ?? (() => undefined); }
  dispose(): void { this.closed = true; this.stop(); this.kit?.cancel(); this.kit = null; document.removeEventListener('visibilitychange', this.visibility); }
}
