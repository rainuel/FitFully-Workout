import { h } from '../utils/dom.js';

/** A friendly "nothing here yet" block, optionally with one link to get started. */
export function emptyState({ title, body = null, action = null }) {
  return h(
    'div',
    { class: 'empty-state' },
    h('p', { class: 'empty-state__title' }, title),
    body ? h('p', { class: 'muted' }, body) : null,
    action ? h('a', { class: 'btn btn--primary', href: action.href }, action.label) : null,
  );
}
