// Workout clock with Pause / Resume. The time shown is computed from what is
// stored in the database (start time, time spent paused), so it stays correct
// across screens and after the app has been closed.
//
//   const bar = createSessionBar({ session, onPause, onResume });
//   bar.update(newSession);  bar.destroy();

import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { elapsedMs, formatClock } from '../services/workout-rules.js';

export function createSessionBar({ session, onPause, onResume }) {
  let current = session;
  let shownPaused = null;

  const clock = h('span', { class: 'session-bar__clock', role: 'timer', 'aria-label': 'Workout time' });
  const caption = h('span', { class: 'session-bar__caption' });
  const button = h('button', { class: 'btn btn--secondary btn--compact', type: 'button', onClick: () => (current.pausedAt !== null ? onResume() : onPause()) });
  const element = h(
    'section',
    { class: 'session-bar', 'aria-label': 'Workout clock' },
    h('div', { class: 'session-bar__time' }, clock, caption),
    button,
  );

  function tick() {
    const paused = current.pausedAt !== null;
    clock.textContent = formatClock(elapsedMs(current, Date.now()));
    if (paused === shownPaused) return;
    shownPaused = paused;
    element.classList.toggle('is-paused', paused);
    caption.textContent = paused ? 'Paused' : 'Workout time';
    button.replaceChildren(icon(paused ? 'play' : 'pause', { strokeWidth: 2.5 }), paused ? 'Resume' : 'Pause');
  }

  const interval = setInterval(tick, 500);
  tick();

  return {
    element,
    update(next) {
      current = next;
      tick();
    },
    destroy() {
      clearInterval(interval);
    },
  };
}
