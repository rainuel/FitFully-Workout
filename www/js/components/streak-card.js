import { h } from '../utils/dom.js';
import { icon } from './icons.js';

/** The streak on Home: a flame, "12 workout streak", and one encouraging line. */
export function streakCard({ headline, sub, active }) {
  return h(
    'a',
    { class: `streak-card${active ? '' : ' is-idle'}`, href: '#/progress', 'aria-label': `Workout streak: ${headline}. ${sub} Open progress.` },
    h('span', { class: 'streak-card__icon', 'aria-hidden': 'true' }, icon('flame')),
    h('div', { class: 'streak-card__text' }, h('p', { class: 'streak-card__headline' }, headline), h('p', { class: 'streak-card__sub' }, sub)),
    h('span', { class: 'streak-card__chevron', 'aria-hidden': 'true' }, icon('chevron', { strokeWidth: 2.6 })),
  );
}