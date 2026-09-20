// Workout logic. Screens call these functions; they never write SQL.
//
// Everything a workout needs is saved to the database the moment it happens
// (a set ticked off, a weight changed, the rest timer started, a pause), so
// closing or losing the app at any point loses nothing. The rest timer is
// stored as an absolute end time, so it keeps counting while the app is closed.
//
// Functions return { ok: true, ... } or { ok: false, errors } for problems the
// user can understand, and throw only for unexpected failures. `nowMs` is
// injectable so the logic can be tested.

import { isoWeekday, toLocalDateString } from '../utils/dates.js';
import * as W from '../models/workout.js';
import { loadWeek } from './schedule-service.js';
import { getProgramDefaults, loadDayEditor } from './program-service.js';
import { REST_MAX_MS, validateSetEntry } from './workout-rules.js';
import { clamp } from './program-rules.js';
import { assessExercise, recordSessionProgression } from './progression-service.js';

const FINISHED = 'This workout is already finished.';
const PAUSED = 'The workout is paused. Resume to keep logging.';

function lockedReason(session) {
  if (!session) return 'That workout no longer exists.';
  if (session.status !== 'in_progress') return FINISHED;
  if (session.pausedAt !== null) return PAUSED;
  return null;
}

// ---- Loading ----------------------------------------------------------------

export async function loadSession(db, sessionId) {
  return W.getSession(db, sessionId);
}

/** The workout in progress, if any. Used by Home to offer "Continue". */
export async function getActiveSession(db) {
  return W.getActiveSession(db);
}

/**
 * Decides what the Workout tab shows:
 *   active  a workout is in progress (any day: an unfinished one is always resumable)
 *   done    today's workout is finished
 *   rest    today is a rest day
 *   empty   training day with no exercises planned
 *   ready   training day, plan loaded, not started
 */
export async function loadWorkoutHome(db, now = new Date()) {
  const active = await W.getActiveSession(db);
  if (active) return { kind: 'active', session: active, exercises: await W.getSessionExercises(db, active.id) };

  const { today } = await loadWeek(db, now);

  const done = await W.getCompletedSessionForDate(db, toLocalDateString(now));
  if (done) return { kind: 'done', today, session: done, exercises: await W.getSessionExercises(db, done.id) };

  if (today.isRest) return { kind: 'rest', today };

  const data = await loadDayEditor(db, today.weekday);
  if (!data || data.exercises.length === 0) return { kind: 'empty', today };
  return { kind: 'ready', today, plan: data.exercises };
}

/** Everything the exercise screen needs, including last time's sets. */
export async function loadExerciseScreen(db, workoutExerciseId) {
  const exercise = await W.getWorkoutExercise(db, workoutExerciseId);
  if (!exercise) return null;
  const session = await W.getSession(db, exercise.sessionId);
  const all = await W.getSessionExercises(db, exercise.sessionId);
  const index = all.findIndex((e) => e.id === exercise.id);
  const previous = await W.findPreviousPerformance(db, {
    sessionId: exercise.sessionId,
    libraryId: exercise.libraryId,
    name: exercise.name,
  });
  return {
    session,
    exercise,
    previous,
    instructions: await W.getExerciseInstructions(db, exercise.libraryId),
    defaults: await getProgramDefaults(db),
    progression: await assessExercise(db, exercise),
    index,
    total: all.length,
    previousExerciseId: index > 0 ? all[index - 1].id : null,
    nextExerciseId: index < all.length - 1 ? all[index + 1].id : null,
  };
}

// ---- Starting ---------------------------------------------------------------

function snapshotPlan(planExercises) {
  return planExercises.map((pe) => {
    const sets = [];
    pe.warmupSets.forEach((s, i) =>
      sets.push({ kind: 'warmup', setNumber: i + 1, repMin: s.reps, repMax: s.reps, weight: s.weight, reps: s.reps }),
    );
    pe.workingSets.forEach((s, i) =>
      sets.push({ kind: 'working', setNumber: i + 1, repMin: s.min, repMax: s.max, weight: pe.workingWeight, reps: null }),
    );
    return {
      libraryId: pe.exerciseId,
      programExerciseId: pe.id,
      name: pe.name,
      targetWeight: pe.workingWeight,
      unit: pe.weightUnit,
      restSeconds: pe.restSeconds,
      sets,
    };
  });
}

/**
 * Starts today's workout from the program. If one is already in progress it
 * is returned instead, so a double tap can never create two.
 */
export async function startWorkout(db, nowMs = Date.now()) {
  const existing = await W.getActiveSession(db);
  if (existing) return { ok: true, sessionId: existing.id, resumed: true };

  const now = new Date(nowMs);
  const data = await loadDayEditor(db, isoWeekday(now));
  if (!data || data.day.isRest) return { ok: false, errors: ['Today is a rest day.'] };
  if (data.exercises.length === 0) return { ok: false, errors: ['Add at least one exercise to today’s plan first.'] };

  try {
    const sessionId = await W.insertSession(db, {
      date: toLocalDateString(now),
      weekday: data.day.weekday,
      dayName: data.day.name,
      startedAt: now.toISOString(),
      exercises: snapshotPlan(data.exercises),
    });
    return { ok: true, sessionId, resumed: false };
  } catch (err) {
    // A second tap can lose the race against the one-active-workout rule.
    const raced = await W.getActiveSession(db);
    if (raced) return { ok: true, sessionId: raced.id, resumed: true };
    throw err;
  }
}

// ---- Logging sets -----------------------------------------------------------

async function refreshExercise(tx, exerciseId, sessionId) {
  const status = await W.syncExerciseStatus(tx, exerciseId);
  await W.recountCompletedExercises(tx, sessionId);
  return status;
}

/** Saves weight/reps as they are typed, without marking the set done. */
export async function saveSetValues(db, setId, { weight, reps }) {
  const checked = validateSetEntry({ weight, reps });
  if (!checked.ok) return checked;
  return db.transaction(async (tx) => {
    const set = await W.getSet(tx, setId);
    if (!set) return { ok: false, errors: ['That set no longer exists.'] };
    const header = await W.getExerciseHeader(tx, set.exerciseId);
    const session = await W.getSession(tx, header.sessionId);
    if (session?.status !== 'in_progress') return { ok: false, errors: [FINISHED] };
    await W.updateSetValues(tx, setId, { weight, reps });
    return { ok: true };
  });
}

/**
 * Ticks a set off. Working sets start the rest timer (using the exercise's
 * rest time) unless this was the last working set of the whole workout.
 * Warm-up sets never start a rest.
 */
export async function completeSet(db, setId, { weight, reps }, nowMs = Date.now()) {
  const checked = validateSetEntry({ weight, reps });
  if (!checked.ok) return checked;

  return db.transaction(async (tx) => {
    const set = await W.getSet(tx, setId);
    if (!set) return { ok: false, errors: ['That set no longer exists.'] };
    const header = await W.getExerciseHeader(tx, set.exerciseId);
    const session = await W.getSession(tx, header.sessionId);
    const locked = lockedReason(session);
    if (locked) return { ok: false, errors: [locked] };

    await W.markSetCompleted(tx, setId, { weight, reps, completedAt: new Date(nowMs).toISOString() });
    const status = await refreshExercise(tx, set.exerciseId, session.id);
    const remaining = await W.countIncompleteWorkingSets(tx, session.id);

    let restStarted = false;
    if (set.kind === 'working') {
      if (remaining > 0) {
        await W.setRestEndsAt(tx, session.id, nowMs + (header.restSeconds ?? 90) * 1000);
        restStarted = true;
      } else {
        await W.setRestEndsAt(tx, session.id, null);
      }
    }
    return { ok: true, restStarted, exerciseCompleted: status === 'completed', workoutComplete: remaining === 0 };
  });
}

/** Un-ticks a set (a mis-tap). Values are kept; any running rest is left alone. */
export async function uncompleteSet(db, setId) {
  return db.transaction(async (tx) => {
    const set = await W.getSet(tx, setId);
    if (!set) return { ok: false, errors: ['That set no longer exists.'] };
    const header = await W.getExerciseHeader(tx, set.exerciseId);
    const session = await W.getSession(tx, header.sessionId);
    const locked = lockedReason(session);
    if (locked) return { ok: false, errors: [locked] };
    await W.markSetIncomplete(tx, setId);
    await refreshExercise(tx, set.exerciseId, session.id);
    return { ok: true };
  });
}

/** Adds one more working set, copying the last one's target and weight. */
export async function addSet(db, workoutExerciseId) {
  return db.transaction(async (tx) => {
    const exercise = await W.getWorkoutExercise(tx, workoutExerciseId);
    if (!exercise) return { ok: false, errors: ['That exercise no longer exists.'] };
    const session = await W.getSession(tx, exercise.sessionId);
    const locked = lockedReason(session);
    if (locked) return { ok: false, errors: [locked] };

    const working = exercise.sets.filter((s) => s.kind === 'working');
    if (working.length >= 10) return { ok: false, errors: ['An exercise can have at most 10 working sets.'] };
    const last = working[working.length - 1];
    const id = await W.insertSet(tx, exercise.id, {
      kind: 'working',
      setNumber: working.length + 1,
      repMin: last?.targetRepMin ?? 8,
      repMax: last?.targetRepMax ?? 12,
      targetWeight: last?.targetWeight ?? exercise.targetWeight,
      weight: last?.weight ?? last?.targetWeight ?? exercise.targetWeight,
      reps: null,
      unit: exercise.unit,
    });
    await refreshExercise(tx, exercise.id, session.id);
    return { ok: true, id };
  });
}

/** Removes a set that has not been done. The last working set of an exercise can't be removed. */
export async function removeSet(db, setId) {
  return db.transaction(async (tx) => {
    const set = await W.getSet(tx, setId);
    if (!set) return { ok: false, errors: ['That set no longer exists.'] };
    const exercise = await W.getWorkoutExercise(tx, set.exerciseId);
    const session = await W.getSession(tx, exercise.sessionId);
    const locked = lockedReason(session);
    if (locked) return { ok: false, errors: [locked] };
    if (set.completed) return { ok: false, errors: ['Untick the set before removing it.'] };
    if (set.kind === 'working' && exercise.sets.filter((s) => s.kind === 'working').length <= 1) {
      return { ok: false, errors: ['An exercise needs at least one working set.'] };
    }
    await W.deleteSet(tx, setId);
    await W.renumberSets(tx, exercise.id, set.kind);
    await refreshExercise(tx, exercise.id, session.id);
    return { ok: true };
  });
}

// ---- Rest timer -------------------------------------------------------------

/** Adds or removes time from the running rest (e.g. ±15 s). Clamped to 0 ... 15 min. */
export async function adjustRest(db, sessionId, deltaMs, nowMs = Date.now()) {
  return db.transaction(async (tx) => {
    const session = await W.getSession(tx, sessionId);
    if (session?.status !== 'in_progress' || session.restEndsAt === null) return { ok: true };
    const reference = session.pausedAt ?? nowMs;
    const remaining = Math.max(0, session.restEndsAt - reference);
    const next = clamp(remaining + deltaMs, 0, REST_MAX_MS);
    await W.setRestEndsAt(tx, sessionId, reference + next);
    return { ok: true };
  });
}

/** Ends the rest early, or dismisses a finished one. */
export async function skipRest(db, sessionId) {
  await W.setRestEndsAt(db, sessionId, null);
  return { ok: true };
}

// ---- Pause / resume ---------------------------------------------------------

/** Freezes the workout clock and the rest timer. */
export async function pauseWorkout(db, sessionId, nowMs = Date.now()) {
  return db.transaction(async (tx) => {
    const session = await W.getSession(tx, sessionId);
    if (!session) return { ok: false, errors: ['That workout no longer exists.'] };
    if (session.status !== 'in_progress') return { ok: false, errors: [FINISHED] };
    if (session.pausedAt !== null) return { ok: true };
    await W.setSessionPause(tx, sessionId, { pausedAt: nowMs, pausedMs: session.pausedMs, restEndsAt: session.restEndsAt });
    return { ok: true };
  });
}

/** Unfreezes. Time spent paused is not counted, and a running rest continues where it stopped. */
export async function resumeWorkout(db, sessionId, nowMs = Date.now()) {
  return db.transaction(async (tx) => {
    const session = await W.getSession(tx, sessionId);
    if (!session) return { ok: false, errors: ['That workout no longer exists.'] };
    if (session.status !== 'in_progress') return { ok: false, errors: [FINISHED] };
    if (session.pausedAt === null) return { ok: true };
    const away = Math.max(0, nowMs - session.pausedAt);
    await W.setSessionPause(tx, sessionId, {
      pausedAt: null,
      pausedMs: session.pausedMs + away,
      restEndsAt: session.restEndsAt === null ? null : session.restEndsAt + away,
    });
    return { ok: true };
  });
}

// ---- Finishing --------------------------------------------------------------

/**
 * Ends the workout, whether or not everything was done ("finish early").
 * Every set already logged is kept. A workout with no working set logged is
 * discarded instead: there is nothing to keep, and it must not count as a
 * training day.
 *
 * Returns { ok, discarded, early }.
 */
export async function finishWorkout(db, sessionId, nowMs = Date.now()) {
  return db.transaction(async (tx) => {
    const session = await W.getSession(tx, sessionId);
    if (!session) return { ok: false, errors: ['That workout no longer exists.'] };
    if (session.status !== 'in_progress') return { ok: false, errors: [FINISHED] };

    if ((await W.countCompletedWorkingSets(tx, sessionId)) === 0) {
      await W.deleteSession(tx, sessionId);
      return { ok: true, discarded: true, early: false };
    }

    const away = session.pausedAt === null ? 0 : Math.max(0, nowMs - session.pausedAt);
    await W.recountCompletedExercises(tx, sessionId);
    await W.markSessionFinished(tx, sessionId, {
      finishedAt: new Date(nowMs).toISOString(),
      pausedMs: session.pausedMs + away,
    });
    await W.logScheduleOutcome(tx, {
      date: session.date,
      weekday: session.weekday,
      dayName: session.dayName,
      outcome: 'completed',
    });
    await recordSessionProgression(tx, sessionId);

    const finished = await W.getSession(tx, sessionId);
    return { ok: true, discarded: false, early: finished.exercisesCompleted < finished.exercisesPlanned };
  });
}

/** Throws away a workout that is still in progress (the "Discard" choice). Finished workouts can't be discarded. */
export async function discardWorkout(db, sessionId) {
  return db.transaction(async (tx) => {
    const session = await W.getSession(tx, sessionId);
    if (!session) return { ok: false, errors: ['That workout no longer exists.'] };
    if (session.status !== 'in_progress') return { ok: false, errors: [FINISHED] };
    await W.deleteSession(tx, sessionId);
    return { ok: true };
  });
}
