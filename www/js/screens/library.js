import { h } from '../utils/dom.js';
import { loadLibrary } from '../services/exercise-service.js';
import { screenHeader } from '../components/screen-header.js';
import { exerciseBrowser } from '../components/exercise-browser.js';
import { icon } from '../components/icons.js';

/** Browse and edit the exercise library, and create custom exercises. */
export async function renderLibrary(root, { db }) {
  const exercises = await loadLibrary(db);
  root.append(
    screenHeader({ eyebrow: 'Program', title: 'Exercise library', backHref: '#/program', backLabel: 'Program' }),
    h('a', { class: 'btn btn--primary btn--block', href: '#/program/library/new' }, icon('plus', { strokeWidth: 2.5 }), 'New exercise'),
    exerciseBrowser({ exercises, hrefFor: (exercise) => `#/program/library/${exercise.id}` }),
  );
}
