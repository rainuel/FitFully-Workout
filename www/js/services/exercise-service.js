// Exercise library logic: validation, create/edit, and safe removal.
// Services return { ok: false, errors } for problems the user can fix, and
// throw only for unexpected failures.

import {
  archiveExercise,
  countProgramUses,
  deleteExercise,
  findExerciseByName,
  getExercise,
  insertExercise,
  listExercises,
  updateExercise,
} from '../models/exercise.js';

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Traps',
  'Biceps',
  'Triceps',
  'Forearms',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Full body',
  'Other',
];

export const EXERCISE_LIMITS = { name: 60, instructions: 1000, notes: 500 };

function clean(text) {
  const trimmed = (text ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export function validateExerciseInput(input) {
  const errors = [];
  const name = (input.name ?? '').trim();
  if (name === '') errors.push('Give the exercise a name.');
  else if (name.length > EXERCISE_LIMITS.name) errors.push(`Names can be at most ${EXERCISE_LIMITS.name} characters.`);

  const instructions = clean(input.instructions);
  if (instructions && instructions.length > EXERCISE_LIMITS.instructions) {
    errors.push(`Instructions can be at most ${EXERCISE_LIMITS.instructions} characters.`);
  }
  const notes = clean(input.notes);
  if (notes && notes.length > EXERCISE_LIMITS.notes) errors.push(`Notes can be at most ${EXERCISE_LIMITS.notes} characters.`);

  if (errors.length > 0) return { ok: false, errors, value: null };
  return {
    ok: true,
    errors: [],
    value: { name, muscleGroup: clean(input.muscleGroup) ?? 'Other', instructions, notes },
  };
}

export async function loadLibrary(db) {
  return listExercises(db);
}

export async function loadExercise(db, id) {
  return getExercise(db, id);
}

/** Creates (id = null) or updates an exercise. Returns { ok, id } or { ok: false, errors }. */
export async function saveExercise(db, id, input) {
  const checked = validateExerciseInput(input);
  if (!checked.ok) return checked;

  const clash = await findExerciseByName(db, checked.value.name, id);
  if (clash) return { ok: false, errors: [`You already have an exercise called “${clash.name}”.`] };

  if (id === null) {
    const newId = await insertExercise(db, checked.value);
    return { ok: true, id: newId };
  }
  const existing = await getExercise(db, id);
  if (!existing) return { ok: false, errors: ['That exercise no longer exists.'] };
  await updateExercise(db, id, checked.value);
  return { ok: true, id };
}

/**
 * Removes a custom exercise. If the program still uses it, it is hidden from
 * the library instead (so the program keeps working). History always keeps its
 * own copy of the name. Built-in exercises can be edited but not removed.
 */
export async function removeExercise(db, id) {
  const existing = await getExercise(db, id);
  if (!existing) return { ok: false, errors: ['That exercise no longer exists.'] };
  if (!existing.isCustom) return { ok: false, errors: ['Built-in exercises can’t be removed.'] };

  const uses = await countProgramUses(db, id);
  if (uses > 0) {
    await archiveExercise(db, id);
    return { ok: true, outcome: 'archived' };
  }
  await deleteExercise(db, id);
  return { ok: true, outcome: 'deleted' };
}

/** Search + muscle-group filter used by the library and the exercise picker. */
export function filterExercises(exercises, { query = '', muscle = null } = {}) {
  const q = query.trim().toLowerCase();
  return exercises.filter((e) => {
    if (muscle && e.muscleGroup !== muscle) return false;
    if (!q) return true;
    return e.name.toLowerCase().includes(q) || (e.muscleGroup ?? '').toLowerCase().includes(q);
  });
}
