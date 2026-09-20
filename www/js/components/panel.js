import { h } from '../utils/dom.js';

/** A titled card that groups related controls. */
export function panel(title, ...children) {
  return h('section', { class: 'panel panel--form' }, title ? h('h2', { class: 'section-title' }, title) : null, ...children);
}
