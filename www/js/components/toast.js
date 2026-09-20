import { h } from '../utils/dom.js';

let current = null;

/** A short confirmation at the bottom of the screen. Announced to screen readers. */
export function showToast(text, { ms = 2200 } = {}) {
  if (current) current.remove();
  const el = h('div', { class: 'toast', role: 'status' }, text);
  current = el;
  document.body.append(el);
  setTimeout(() => {
    if (current === el) current = null;
    el.remove();
  }, ms);
}
