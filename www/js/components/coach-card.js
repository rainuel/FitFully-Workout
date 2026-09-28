import { h } from '../utils/dom.js';

/** Home dashboard: a quote, then short tips for weight, sets and what to train. `tips` from coach-service. */
export function coachCard(tips) {
  const [quote, ...rest] = tips;
  return h(
    'section',
    { class: 'coach', 'aria-label': 'Coach' },
    h('blockquote', { class: 'coach__quote' }, h('p', { class: 'coach__label' }, quote.label), h('p', { class: 'coach__quote-text' }, quote.body)),
    ...rest.map((tip) =>
      h('article', { class: 'coach__tip' }, h('p', { class: 'coach__label' }, tip.label), h('h3', { class: 'coach__title' }, tip.title), h('p', { class: 'coach__body' }, tip.body)),
    ),
    h('p', { class: 'coach__note' }, 'General guidance, not medical advice.'),
  );
}