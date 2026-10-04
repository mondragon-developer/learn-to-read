/** Minimal DOM helpers — enough for a framework-light UI, no virtual DOM. */
type Child = Node | string | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | EventListener | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function replace(host: Element, ...children: Child[]): void {
  host.replaceChildren();
  append(host, children);
}

let toastTimer: number | undefined;
export function toast(message: string): void {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) { el = h('div', { class: 'toast' }); document.body.appendChild(el); }
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove('show'), 2600);
}

/** Inline SVG element from markup (needs the SVG namespace, so it cannot go through h()). */
export function svg(viewBox: string, inner: string, className = ''): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', viewBox);
  if (className) el.setAttribute('class', className);
  el.innerHTML = inner;
  return el;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function shuffle<T>(items: T[], seed = Math.random()): T[] {
  const a = [...items];
  let s = Math.floor(seed * 2 ** 31) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
