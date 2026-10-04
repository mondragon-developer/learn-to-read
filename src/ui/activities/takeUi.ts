import { checkTake, type RecordError, type Take, type TakeReport, type VoiceRecorder } from '@domain/audio/VoiceRecorder';
import type { I18n } from '@domain/i18n/i18n';
import { h, replace } from '../dom';

/** What a record attempt produced: a take, or a message for the grown-up (and whether to stop trying). */
export type RecordOutcome = { take: Take } | { error: RecordError; message: string };

/**
 * Big red record button → live level bar + seconds while he speaks → the take.
 * Errors come back as a parent-language message instead of failing silently.
 */
export async function recordTake(recorder: VoiceRecorder, t: I18n, panel: HTMLElement, label: string, maxMs: number): Promise<RecordOutcome> {
  await new Promise<void>((resolve) => replace(panel,
    h('button', { class: 'mic rec pulse', 'aria-label': `Record: ${label}`, onClick: () => resolve() },
      h('span', { class: 'mic-icon', 'aria-hidden': 'true' }, '🎙️'), h('span', {}, label)),
    h('p', { class: 'small muted' }, 'Tap, then say it. You will hear yourself!')));
  const start = await recorder.record(maxMs);
  if (!start.ok) return { error: start.error, message: t.t(`rec.error.${start.error}`, { detail: start.detail ?? '' }) };
  const rec = start.recording;
  const bar = h('span', { class: 'level-fill' });
  const secs = h('span', { class: 'rec-secs' }, '0.0 s');
  replace(panel,
    h('button', { class: 'mic rec listening', 'aria-label': 'Stop recording', onClick: () => rec.stop() },
      h('span', { class: 'mic-icon', 'aria-hidden': 'true' }, '⏹'), h('span', {}, 'Done')),
    h('div', { class: 'rec-live' }, h('span', { class: 'level', role: 'meter', 'aria-label': 'Microphone level' }, bar), secs),
    h('p', { class: 'coach small' }, 'Say it now!'));
  const t0 = performance.now();
  let raf = 0;
  const tick = (): void => {
    bar.style.width = `${Math.round(rec.level() * 100)}%`;
    secs.textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
    raf = requestAnimationFrame(tick);
  };
  tick();
  const take = await rec.done;
  cancelAnimationFrame(raf);
  return { take };
}

/** Plays his take and says what happened: "🎙 Recorded 1.8 s", or why it can't be heard. */
export async function playTake(recorder: VoiceRecorder, t: I18n, take: Take, show: (badge: HTMLElement) => void): Promise<TakeReport & { ok: boolean }> {
  const report = await recorder.play(take);
  const problem = checkTake(report);
  const seconds = report.seconds || take.ms / 1000;
  if (!problem) {
    show(h('p', { class: 'rec-badge ok' }, t.t('rec.captured', { s: seconds.toFixed(1) })));
    return { ...report, ok: true };
  }
  const message = t.t(`rec.problem.${problem}`, {
    bytes: report.bytes, peak: report.peak.toFixed(3), kb: (report.bytes / 1024).toFixed(1), type: take.type, error: report.error ?? '',
  });
  show(h('p', { class: 'rec-badge warn', role: 'alert' }, `⚠️ ${message}`));
  return { ...report, ok: false };
}
