import { h } from '../utils/dom.js';
import { addExerciseToDay, loadDayEditor } from '../services/program-service.js';
import { loadLibrary } from '../services/exercise-service.js';
import { screenHeader } from '../components/screen-header.js';
import { exerciseBrowser } from '../components/exercise-browser.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';
import { dayNotFound } from './program-day.js';

/** Choose a library exercise to add to a day. Adding jumps straight into the editor for its sets and weight. */
export async function renderExercisePicker(root, { db, params, navigate }) {
  const weekday = Number(params.weekday);
  const data = Number.isInteger(weekday) ? await loadDayEditor(db, weekday) : null;
  if (!data) return dayNotFound(root);

  const exercises = await loadLibrary(db);
  let busy = false;

  root.append(
    screenHeader({ eyebrow: `Add to ${data.day.name}`, title: 'Choose exercise', backHref: `#/program/day/${weekday}`, backLabel: data.day.isRest ? 'Day' : data.day.name }),
    h('a', { class: 'link-card', href: `#/program/day/${weekday}/new` }, icon('plus'), h('span', { class: 'link-card__text' }, h('span', { class: 'link-card__title' }, 'Create your own exercise')), icon('chevron')),
    exerciseBrowser({
      exercises,
      onSelect: async (exercise) => {
        if (busy) return;
        busy = true;
        try {
          const result = await addExerciseToDay(db, data.day.id, exercise.id);
          if (!result.ok) throw new Error(result.errors[0]);
          navigate(`/program/edit/${result.id}`);
        } catch (err) {
          busy = false;
          console.error('Add exercise failed', err);
          showToast('Couldn’t add that exercise');
        }
      },
    }),
  );
}
