import { h } from '../utils/dom.js';
import { icon as drawIcon } from './icons.js';

// Training days are drawn as weight plates. Colours follow the standard
// competition plate order (red, blue, yellow, green, white) and repeat if the
// program has more than five training days. Rest days are an empty ring.
// A day can also pick its own icon and colour: then it is a solid coloured
// disc with the icon inside (an unset colour keeps the automatic plate colour).
const PLATE_COLOURS = 5;

export function plate({ plateIndex = null, isRest = false, isToday = false, large = false, icon = null, color = null }) {
  const classes = ['plate'];
  if (isRest) classes.push('plate--rest');
  if (isToday) classes.push('plate--today');
  if (large) classes.push('plate--lg');
  const custom = !isRest && icon;
  if (custom) classes.push('plate--icon');

  return h(
    'span',
    {
      class: classes.join(' '),
      'data-plate': isRest || plateIndex === null ? null : String(plateIndex % PLATE_COLOURS),
      'data-color': isRest ? null : color,
      'aria-hidden': 'true',
    },
    custom ? drawIcon(icon, { strokeWidth: 2.4 }) : null,
  );
}