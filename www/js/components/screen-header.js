import { h } from '../utils/dom.js';
import { icon } from './icons.js';

/**
 * Title area for screens below a tab: an optional back link, a small eyebrow
 * line, and the title. `onBack` lets a screen intercept the back tap (for
 * example to ask about unsaved changes); without it the link works normally.
 */
export function screenHeader({ title, eyebrow = null, backHref = null, backLabel = 'Back', onBack = null }) {
  return h(
    'header',
    { class: 'screen-header' },
    backHref
      ? h(
          'a',
          {
            class: 'back-link',
            href: backHref,
            onClick: onBack
              ? (event) => {
                  event.preventDefault();
                  onBack(backHref);
                }
              : null,
          },
          icon('back'),
          backLabel,
        )
      : null,
    eyebrow ? h('p', { class: 'screen-header__eyebrow' }, eyebrow) : null,
    h('h1', { class: 'screen-title' }, title),
  );
}
