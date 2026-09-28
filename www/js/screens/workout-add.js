import { h } from '../utils/dom.js';
import { addExerciseToWorkout, getActiveSession } from '../services/workout-service.js';
import { loadLibrary } from '../services/exercise-service.js';
import { screenHeader } from '../components/screen-header.js';
import { exerciseBrowser } from '../components/exercise-browser.js';
import { showToast } from '../components/toast.js';

/** Choose a library exercise to add to the workout in progress. Route: /workout/add */
export async function renderWorkoutAdd(root, { db, navigate }) {
  const exercises = await loadLibrary(db);
  const session = await getActiveSession(db);
  if (!session) {
    root.append(
      screenHeader({ title: 'No workout in progress', backHref: '#/workout', backLabel: 'Workout' }),
      h('p', { class: 'muted' }, 'Start a workout first, then you can add exercises to it.'),
    );
    return;
  }

  let busy = false;
  root.append(
    screenHeader({ eyebrow: `Add to ${session.dayName}`, title: 'Choose exercise', backHref: '#/workout', backLabel: 'Workout' }),
    exerciseBrowser({
      exercises,
      onSelect: async (exercise) => {
        if (busy) return;
        busy = true;
        try {
          const result = await addExerciseToWorkout(db, session.id, exercise.id);
          if (!result.ok) throw new Error(result.errors[0]);
          navigate(`/workout/exercise/${result.id}`);
        } catch (err) {
          busy = false;
          console.error('Add exercise to workout failed', err);
          showToast(err.message || 'Couldn’t add that exercise');
        }
      },
    }),
  );
}
