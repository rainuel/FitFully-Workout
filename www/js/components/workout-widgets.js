// The workout clock and the rest timer, wired to the workout service. Used by
// both the Workout screen and the exercise screen so they behave identically.
//
//   const widgets = createWorkoutWidgets({ db, session, onPauseChange });
//   widgets.bar.element, widgets.timer.element   -> place them in the screen
//   widgets.destroy()                            -> from the screen's cleanup
//
// Pausing or resuming changes what the whole screen can do, so it calls
// onPauseChange() and the screen repaints. Rest changes only update the timer.

import { adjustRest, loadSession, pauseWorkout, resumeWorkout, skipRest } from '../services/workout-service.js';
import { createRestTimer } from './rest-timer.js';
import { createSessionBar } from './session-bar.js';
import { showToast } from './toast.js';

export function createWorkoutWidgets({ db, session, onPauseChange }) {
  async function run(action) {
    try {
      const result = await action();
      if (result && result.ok === false) showToast(result.errors[0]);
      return result;
    } catch (err) {
      console.error('Workout action failed', err);
      showToast('Something went wrong. Try again.');
      return null;
    }
  }

  async function reload() {
    const fresh = await loadSession(db, session.id);
    if (!fresh) return;
    bar.update(fresh);
    timer.update(fresh);
  }

  const bar = createSessionBar({
    session,
    onPause: () =>
      run(async () => {
        const result = await pauseWorkout(db, session.id);
        if (result.ok) await onPauseChange();
        return result;
      }),
    onResume: () =>
      run(async () => {
        const result = await resumeWorkout(db, session.id);
        if (result.ok) await onPauseChange();
        return result;
      }),
  });

  const timer = createRestTimer({
    session,
    onAdjust: (deltaMs) =>
      run(async () => {
        const result = await adjustRest(db, session.id, deltaMs);
        await reload();
        return result;
      }),
    onSkip: () =>
      run(async () => {
        const result = await skipRest(db, session.id);
        await reload();
        return result;
      }),
  });

  return {
    bar,
    timer,
    update: (fresh) => {
      bar.update(fresh);
      timer.update(fresh);
    },
    destroy() {
      bar.destroy();
      timer.destroy();
    },
  };
}
