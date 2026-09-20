import { h } from '../utils/dom.js';
import { icon } from './icons.js';

export const TABS = [
  { id: 'home', label: 'Home', icon: 'home', path: '/home' },
  { id: 'workout', label: 'Workout', icon: 'workout', path: '/workout' },
  { id: 'progress', label: 'Progress', icon: 'progress', path: '/progress' },
  { id: 'program', label: 'Program', icon: 'program', path: '/program' },
  { id: 'profile', label: 'Profile', icon: 'profile', path: '/profile' },
];

/** Persistent bottom navigation. Tabs are real links, so they work with the back button and screen readers. */
export function createBottomNav() {
  const links = new Map();

  const nav = h(
    'nav',
    { class: 'bottom-nav', 'aria-label': 'Main' },
    ...TABS.map((tab) => {
      const link = h('a', { href: `#${tab.path}`, class: 'bottom-nav__item' }, icon(tab.icon), h('span', null, tab.label));
      links.set(tab.id, link);
      return link;
    }),
  );

  function setActive(tabId) {
    for (const [id, link] of links) {
      if (id === tabId) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  return { element: nav, setActive };
}
