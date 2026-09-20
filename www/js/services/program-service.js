// Program editing logic. Screens call these functions; they never write SQL or
// apply rules themselves.

import { getAllSettings } from '../models/settings.js';
import {
  deleteProgramExercise,
  getActiveProgram,
  getDayExercises,
  getProgramDay,
  getProgramDays,
  getProgramExercise,
  insertProgramExercise,
  setExerciseOrder,
  updateProgramDay,
  updateProgramExercise,
} from '../models/program.js';
import { getExercise } from '../models/exercise.js';
import {
  DEFAULT_REP_MAX,
  DEFAULT_REP_MIN,
  DEFAULT_WORKING_SETS,
  LIMITS,
  UNITS,
  clamp,
  validateDayInput,
  validateProgramExerciseDraft,
} from './program-rules.js';
import { reconcileSchedule } from './streak-service.js';
import { syncReminders } from './notification-service.js';

/**
 * Records the days that have already passed (scheduled / missed / rest) BEFORE
 * the plan changes, so an edit today can never change what an earlier day was.
 * Bookkeeping only: a failure here must not block the edit.
 */
async function freezePastDays(db) {
  try {
    await reconcileSchedule(db);
  } catch (err) {
    console.error('Could not record past days before editing the program', err);
  }
}

/** The user's unit, weight increment, and default rest time, cleaned up. */
export async function getProgramDefaults(db) {
  const s = await getAllSettings(db);
  const increment = Number(s.weight_increment);
  const rest = Number(s.default_rest_seconds);
  return {
    unit: UNITS.includes(s.weight_unit) ? s.weight_unit : 'lbs',
    increment: Number.isFinite(increment) && increment > 0 ? increment : 5,
    restSeconds: Number.isFinite(rest) ? clamp(Math.round(rest), LIMITS.minRestSeconds, LIMITS.maxRestSeconds) : 90,
  };
}

export async function loadProgramOverview(db) {
  const program = await getActiveProgram(db);
  if (!program) throw new Error('No active program found in the database.');
  const days = await getProgramDays(db, program.id);
  return { program, days };
}

/** One day plus its exercises, or null if the weekday is not 1..7. */
export async function loadDayEditor(db, weekday) {
  const program = await getActiveProgram(db);
  if (!program) throw new Error('No active program found in the database.');
  const day = await getProgramDay(db, program.id, weekday);
  if (!day) return null;
  const exercises = await getDayExercises(db, day.id);
  return { program, day, exercises };
}

/** Renames a day or turns it into (or back from) a rest day. */
export async function saveDay(db, dayId, input) {
  const checked = validateDayInput(input);
  if (!checked.ok) return checked;
  await freezePastDays(db);
  await updateProgramDay(db, dayId, checked.value);
  // Reminders follow the plan: renaming a day or making it a rest day changes them.
  syncReminders(db).catch((err) => console.error('Could not update reminders after a day change', err));
  return { ok: true };
}

/** Adds a library exercise to the end of a day with a sensible starting plan. */
export async function addExerciseToDay(db, dayId, exerciseId) {
  const exercise = await getExercise(db, exerciseId);
  if (!exercise) return { ok: false, errors: ['That exercise no longer exists.'] };
  await freezePastDays(db);
  const defaults = await getProgramDefaults(db);
  const id = await insertProgramExercise(db, {
    dayId,
    exerciseId,
    workingWeight: 0,
    weightUnit: defaults.unit,
    restSeconds: defaults.restSeconds,
    workingSets: Array.from({ length: DEFAULT_WORKING_SETS }, () => ({ min: DEFAULT_REP_MIN, max: DEFAULT_REP_MAX })),
  });
  return { ok: true, id };
}

export async function loadProgramExercise(db, id) {
  return getProgramExercise(db, id);
}

/**
 * Saves the plan for one exercise. This changes the PROGRAM only; workout
 * history is never touched, so past sessions keep the weights they were done at.
 */
export async function saveProgramExercise(db, id, draft) {
  const checked = validateProgramExerciseDraft(draft);
  if (!checked.ok) return checked;
  const existing = await getProgramExercise(db, id);
  if (!existing) return { ok: false, errors: ['That exercise was removed from the program.'] };
  await updateProgramExercise(db, id, checked.value);
  return { ok: true };
}

export async function removeProgramExercise(db, id) {
  await freezePastDays(db);
  await deleteProgramExercise(db, id);
  return { ok: true };
}

export async function reorderDayExercises(db, dayId, orderedIds) {
  await setExerciseOrder(db, dayId, orderedIds);
  return { ok: true };
}
