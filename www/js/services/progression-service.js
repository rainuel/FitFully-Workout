// Progression logic. Screens call these functions; they never write SQL.
//
// The rule that matters most: a program's working weight changes ONLY when the
// user explicitly commits a new weight (commitWorkingWeight / commitProgression).
// Logging a set at a different weight is history and changes nothing. Keeping
// the weight, a missed target, and finishing a workout never touch the program,
// and no function here ever edits a logged set.

import * as W from '../models/workout.js';
import * as P from '../models/progression.js';
import { getProgramExercise } from '../models/program.js';
import { setSetting } from '../models/settings.js';
import { getProgramDefaults } from './program-service.js';
import { LIMITS, stepForUnit } from './program-rules.js';
import { evaluateProgression, validateIncrement } from './progression-rules.js';

const DECIDED = ['kept', 'committed'];
const NOT_IN_PROGRAM = 'This exercise is no longer in your program, so its weight can’t be changed here.';

/**
 * Where progression stands for one workout exercise:
 *   state: not_applicable | incomplete | not_reached | eligible | kept | committed | applied
 *   `applied` = the program is already at (or above) the suggested weight.
 * Also: liftedWeight, suggestedWeight, currentWeight (the program's), unit,
 * totalSets, and canCommit (the exercise is still in the program).
 */
export async function assessExercise(db, exercise) {
  const defaults = await getProgramDefaults(db);
  const increment = stepForUnit(exercise.unit, defaults);
  const result = evaluateProgression({ sets: exercise.sets, increment });

  const program = exercise.programExerciseId ? await getProgramExercise(db, exercise.programExerciseId) : null;
  const sameUnit = program !== null && program.weightUnit === exercise.unit;
  const out = { ...result, unit: exercise.unit, increment, currentWeight: sameUnit ? program.workingWeight : null, canCommit: sameUnit };

  if (DECIDED.includes(exercise.progressionState)) {
    return { ...out, state: exercise.progressionState, suggestedWeight: exercise.suggestedWeight ?? out.suggestedWeight };
  }
  if (!sameUnit && (result.state === 'eligible' || result.state === 'not_reached')) {
    return { ...out, state: 'not_applicable' };
  }
  if (result.state === 'eligible' && out.currentWeight >= result.suggestedWeight) {
    return { ...out, state: 'applied' };
  }
  return out;
}

export async function getExerciseProgression(db, workoutExerciseId) {
  const exercise = await W.getWorkoutExercise(db, workoutExerciseId);
  return exercise ? assessExercise(db, exercise) : null;
}

/** Progression results for a workout, for the exercises that have something to say. */
export async function getSessionProgression(db, sessionId) {
  const exercises = await W.getSessionExercises(db, sessionId);
  const items = [];
  for (const exercise of exercises) {
    const progression = await assessExercise(db, exercise);
    if (['not_reached', 'eligible', 'kept', 'committed', 'applied'].includes(progression.state)) {
      items.push({ exercise, progression });
    }
  }
  return items;
}

/**
 * Called when a workout is finished: stores the outcome (eligible / not reached)
 * on each exercise so it is part of that day's record. Decisions the user
 * already made are left alone.
 */
export async function recordSessionProgression(db, sessionId) {
  const exercises = await W.getSessionExercises(db, sessionId);
  for (const exercise of exercises) {
    if (DECIDED.includes(exercise.progressionState)) continue;
    const a = await assessExercise(db, exercise);
    if (a.state === 'eligible' || a.state === 'not_reached') {
      await P.setProgressionState(db, exercise.id, a.state, a.suggestedWeight);
    }
  }
}

/** "KEEP 25 LBS": the program stays as it is. */
export async function keepWeight(db, workoutExerciseId) {
  return db.transaction(async (tx) => {
    const exercise = await W.getWorkoutExercise(tx, workoutExerciseId);
    if (!exercise) return { ok: false, errors: ['That exercise no longer exists.'] };
    const a = await assessExercise(tx, exercise);
    if (a.state !== 'eligible') return { ok: false, errors: ['There is no weight increase to decide on.'] };
    await P.setProgressionState(tx, exercise.id, 'kept', a.suggestedWeight);
    return { ok: true };
  });
}

/**
 * Sets the program's working weight for a workout's exercise. This is the only
 * way a program weight changes through progression, and it is always an
 * explicit user action. Logged sets are not modified.
 */
export async function commitWorkingWeight(db, workoutExerciseId, weight, nowMs = Date.now()) {
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0 || weight > LIMITS.maxWeight) {
    return { ok: false, errors: [`Weight must be more than 0 and at most ${LIMITS.maxWeight}.`] };
  }
  return db.transaction(async (tx) => {
    const exercise = await W.getWorkoutExercise(tx, workoutExerciseId);
    if (!exercise) return { ok: false, errors: ['That exercise no longer exists.'] };
    const program = exercise.programExerciseId ? await getProgramExercise(tx, exercise.programExerciseId) : null;
    if (!program) return { ok: false, errors: [NOT_IN_PROGRAM] };
    if (program.weightUnit !== exercise.unit) {
      return { ok: false, errors: ['The unit for this exercise changed since the workout. Update the weight in your program instead.'] };
    }
    if (program.workingWeight === weight) return { ok: false, errors: [`Your program already uses ${weight}.`] };

    const before = await assessExercise(tx, exercise);
    await P.setProgramWorkingWeight(tx, program.id, weight);
    await P.insertProgressionEvent(tx, {
      exerciseId: exercise.libraryId,
      exerciseName: exercise.name,
      fromWeight: program.workingWeight,
      toWeight: weight,
      unit: exercise.unit,
      createdAt: new Date(nowMs).toISOString(),
    });

    if (before.state === 'eligible' && weight >= before.suggestedWeight) {
      await P.setProgressionState(tx, exercise.id, 'committed', weight);
    }
    return { ok: true, from: program.workingWeight, to: weight, unit: exercise.unit };
  });
}

/** "COMMIT TO 30 LBS": takes the suggested increase for an eligible exercise. */
export async function commitProgression(db, workoutExerciseId, nowMs = Date.now()) {
  const exercise = await W.getWorkoutExercise(db, workoutExerciseId);
  if (!exercise) return { ok: false, errors: ['That exercise no longer exists.'] };
  const a = await assessExercise(db, exercise);
  if (a.state !== 'eligible') return { ok: false, errors: ['There is no weight increase to commit.'] };
  return commitWorkingWeight(db, workoutExerciseId, a.suggestedWeight, nowMs);
}

/**
 * When the weight lifted on the last finished working set differs from the
 * program's, offers it as an explicit "commit this as the working weight"
 * action. Returns { weight, unit, currentWeight } or null.
 */
export async function getCommitOffer(db, workoutExerciseId) {
  const exercise = await W.getWorkoutExercise(db, workoutExerciseId);
  if (!exercise?.programExerciseId) return null;
  const program = await getProgramExercise(db, exercise.programExerciseId);
  if (!program || program.weightUnit !== exercise.unit) return null;
  const done = exercise.sets.filter((s) => s.kind === 'working' && s.completed && Number(s.weight) > 0);
  if (done.length === 0) return null;
  const weight = Number(done[done.length - 1].weight);
  if (weight === program.workingWeight) return null;
  return { weight, unit: exercise.unit, currentWeight: program.workingWeight };
}

// ---- Increment setting ------------------------------------------------------

export async function loadIncrementSettings(db) {
  const { unit, increment } = await getProgramDefaults(db);
  return { unit, increment };
}

export async function saveWeightIncrement(db, value) {
  const checked = validateIncrement(value);
  if (!checked.ok) return checked;
  await setSetting(db, 'weight_increment', checked.value);
  return { ok: true, value: checked.value };
}

