import { h } from '../utils/dom.js';

// Training days are drawn as weight plates. Colours follow the standard
// competition plate order (red, blue, yellow, green, white) and repeat if the
// program has more than five training days. Rest days are an empty ring.
const PLATE_COLOURS = 5;

export function plate({ plateIndex = null, isRest = false, isToday = false, large = false }) {
  const classes = ['plate'];
  if (isRest) classes.push('plate--rest');
  if (isToday) classes.push('plate--today');
  if (large) classes.push('plate--lg');

  return h('span', {
    class: classes.join(' '),
    'data-plate': isRest || plateIndex === null ? null : String(plateIndex % PLATE_COLOURS),
    'aria-hidden': 'true',
  });
}
