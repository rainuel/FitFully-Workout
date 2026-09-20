import { h } from '../utils/dom.js';
import { icon } from './icons.js';

/** The streak on Home: a flame, "12 workout streak", and one encouraging line. */
export function streakCard({ headline, sub, active }) {
  return h(
    'section',
    { class: `streak-card${active ? '' : ' is-idle'}`, 'aria-label': 'Workout streak' },
    h('span', { class: 'streak-card__icon', 'aria-hidden': 'true' }, icon('flame')),
    h('div', null, h('p', { class: 'streak-card__headline' }, headline), h('p', { class: 'streak-card__sub' }, sub)),
  );
}
