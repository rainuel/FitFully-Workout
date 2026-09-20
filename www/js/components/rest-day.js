import { h } from '../utils/dom.js';

const SUGGESTIONS = ['Take a walk', 'Light stretching', 'Mobility work', 'Drink water', 'Sleep well'];

/** Optional recovery ideas. Suggestions only, never tasks. */
export function restDayPanel() {
  return h(
    'section',
    { class: 'rest-ideas', 'aria-label': 'Recovery ideas' },
    h('p', { class: 'rest-ideas__lede' }, 'Recovery is part of the plan. If you feel like doing something:'),
    h('ul', { class: 'chips' }, ...SUGGESTIONS.map((text) => h('li', null, text))),
  );
}
