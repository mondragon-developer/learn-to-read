import type { Kit } from './kit';
import { h, replace } from '../dom';
/** Keep the renderer out of reading startup; retain the light game on unsupported devices. */
export async function soccerBreak(kit: Kit, host: HTMLElement, options: { anytime?: boolean } = {}): Promise<void> {
  if (kit.closed) return;
  replace(host, h('div', { class: 'stadium-loading', role: 'status' }, h('span', { 'aria-hidden': 'true' }, '⚽'), 'Opening Dream Arena…'));
  try {
    const { play3D } = await import('./soccer3d/Game');
    if (kit.closed) return;
    if (await play3D(kit, host, options)) return;
  } catch (error) {
    if (kit.closed) return;
    console.warn('Using the simple soccer view', error);
  }
  if (!kit.closed) {
    const { soccerBreak: simple } = await import('./soccerFlat');
    await simple(kit, host, options);
  }
}
