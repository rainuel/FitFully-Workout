import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/node-db.js';
import { runMigrations } from '../www/js/db/migrations.js';
import { seedIfNeeded } from '../www/js/db/seed.js';
import { addExerciseToDay, removeProgramExercise, saveProgramExercise } from '../www/js/services/program-service.js';
import {
  addSet,
  adjustRest,
  getExerciseBreakSeconds,
  saveExerciseBreakSeconds,
  completeSet,
  finishWorkout,
  loadExerciseScreen,
  loadWorkoutHome,
  pauseWorkout,
  removeSet,
  resumeWorkout,
  saveSetValues,
  skipRest,
  startWorkout,
  uncompleteSet,
} from '../www/js/services/workout-service.js';
import * as W from '../www/js/models/workout.js';
import {
  defaultReps,
  describeTargets,
  elapsedMs,
  formatClock,
  restState,
  setProgress,
  validateSetEntry,
} from '../www/js/services/workout-rules.js';

// Monday 21 Sep 2026, 10:00 local time.
const MONDAY = new Date(2026, 8, 21, 10, 0, 0).getTime();
const TUESDAY = new Date(2026, 8, 22, 10, 0, 0).getTime();
const MIN = 60 * 1000;

async function setup() {
  const db = createTestDb();
  await runMigrations(db);
  await seedIfNeeded(db);
  return db;
}

const idOf = async (db, name) => (await db.get('SELECT id FROM exercises WHERE name = ?', [name])).id;
const dayId = async (db, weekday) => (await db.get('SELECT id FROM program_days WHERE weekday = ?', [weekday])).id;

/** Monday: Bench Press (2 warm-ups, 3 × 8–12 at 100 lbs, 2:00 rest) and Shoulder Press (2 × 10, 60 lbs, 1:00 rest). */
async function planMonday(db) {
  const d = await dayId(db, 1);
  const bench = await addExerciseToDay(db, d, await idOf(db, 'Bench Press'));
  const ohp = await addExerciseToDay(db, d, await idOf(db, 'Shoulder Press'));
  assert.equal(bench.ok && ohp.ok, true);
  const a = await saveProgramExercise(db, bench.id, {
    workingWeight: 100,
    weightUnit: 'lbs',
    restSeconds: 120,
    notes: '',
    workingSets: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }],
    warmupSets: [{ reps: 10, weight: 50 }, { reps: 5, weight: 75 }],
  });
  const b = await saveProgramExercise(db, ohp.id, {
    workingWeight: 60,
    weightUnit: 'lbs',
    restSeconds: 60,
    notes: '',
    workingSets: [{ min: 10, max: 10 }, { min: 10, max: 10 }],
    warmupSets: [],
  });
  assert.equal(a.ok && b.ok, true);
  return { benchPe: bench.id, ohpPe: ohp.id };
}

async function startMonday(db, at = MONDAY) {
  const res = await startWorkout(db, at);
  assert.equal(res.ok, true);
  const exercises = await W.getSessionExercises(db, res.sessionId);
  return { sessionId: res.sessionId, bench: exercises[0], ohp: exercises[1] };
}

const working = (ex) => ex.sets.filter((s) => s.kind === 'working');
const warmups = (ex) => ex.sets.filter((s) => s.kind === 'warmup');

// ---- Migration ----------------------------------------------------------------

test('migration 2 adds the pause columns without touching existing rows', async () => {
  const db = await setup();
  const cols = (await db.all('PRAGMA table_info(workout_sessions)')).map((c) => c.name);
  assert.ok(cols.includes('paused_at'));
  assert.ok(cols.includes('paused_ms'));
});

// ---- Starting -----------------------------------------------------------------

test('starting copies the plan: exercises, warm-ups, working sets, unit and rest time', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench, ohp } = await startMonday(db);

  const session = await W.getSession(db, sessionId);
  assert.equal(session.status, 'in_progress');
  assert.equal(session.date, '2026-09-21');
  assert.equal(session.weekday, 1);
  assert.equal(session.dayName, 'Push');
  assert.equal(session.exercisesPlanned, 2);
  assert.equal(session.pausedAt, null);

  assert.deepEqual([bench.name, ohp.name], ['Bench Press', 'Shoulder Press']);
  assert.equal(bench.unit, 'lbs');
  assert.equal(bench.restSeconds, 120);
  assert.equal(warmups(bench).length, 2);
  assert.deepEqual(warmups(bench).map((s) => [s.weight, s.reps, s.completed]), [[50, 10, false], [75, 5, false]]);
  assert.equal(working(bench).length, 3);
  assert.deepEqual(working(bench).map((s) => [s.targetRepMin, s.targetRepMax, s.targetWeight, s.weight, s.reps]), [
    [8, 12, 100, 100, null],
    [8, 12, 100, 100, null],
    [8, 12, 100, 100, null],
  ]);
  // warm-ups come before working sets
  assert.deepEqual(bench.sets.map((s) => s.kind), ['warmup', 'warmup', 'working', 'working', 'working']);
});

test('starting twice returns the same workout, never a second one', async () => {
  const db = await setup();
  await planMonday(db);
  const a = await startWorkout(db, MONDAY);
  const b = await startWorkout(db, MONDAY + 1000);
  assert.equal(b.sessionId, a.sessionId);
  assert.equal(b.resumed, true);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM workout_sessions')).n, 1);
});

test('a rest day and an empty day cannot be started', async () => {
  const db = await setup();
  await planMonday(db);
  const rest = await startWorkout(db, new Date(2026, 8, 24, 10).getTime()); // Thursday
  assert.equal(rest.ok, false);
  const empty = await startWorkout(db, TUESDAY); // Pull has no exercises
  assert.equal(empty.ok, false);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM workout_sessions')).n, 0);
});

test('editing or deleting the plan mid-workout does not change the workout', async () => {
  const db = await setup();
  const { benchPe } = await planMonday(db);
  const { bench } = await startMonday(db);
  await removeProgramExercise(db, benchPe);
  const after = await W.getWorkoutExercise(db, bench.id);
  assert.equal(after.name, 'Bench Press');
  assert.equal(after.sets.length, 5);
  assert.equal(after.programExerciseId, null); // link cleared, snapshot kept
});

test('the Workout tab reports what to show', async () => {
  const db = await setup();
  const now = new Date(MONDAY);
  assert.equal((await loadWorkoutHome(db, now)).kind, 'empty'); // Push has no exercises yet
  await planMonday(db);
  const ready = await loadWorkoutHome(db, now);
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.plan.length, 2);
  assert.equal((await loadWorkoutHome(db, new Date(2026, 8, 24, 10))).kind, 'rest');

  const { sessionId } = await startMonday(db);
  assert.equal((await loadWorkoutHome(db, now)).kind, 'active');
  // an unfinished workout stays resumable on a later day
  assert.equal((await loadWorkoutHome(db, new Date(TUESDAY))).kind, 'active');

  const { bench } = { bench: (await W.getSessionExercises(db, sessionId))[0] };
  await completeSet(db, working(bench)[0].id, { weight: 100, reps: 10 }, MONDAY + MIN);
  await finishWorkout(db, sessionId, MONDAY + 30 * MIN);
  const done = await loadWorkoutHome(db, now);
  assert.equal(done.kind, 'done');
  assert.equal(done.session.id, sessionId);
});

// ---- Logging ------------------------------------------------------------------

test('completing a working set saves it and starts the exercise’s rest', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench } = await startMonday(db);
  const at = MONDAY + 5 * MIN;

  const res = await completeSet(db, working(bench)[0].id, { weight: 105, reps: 9 }, at);
  assert.deepEqual(res, { ok: true, restStarted: true, breakSeconds: 0, exerciseCompleted: false, workoutComplete: false });

  const set = await W.getSet(db, working(bench)[0].id);
  assert.deepEqual([set.completed, set.weight, set.reps, set.completedAt], [true, 105, 9, new Date(at).toISOString()]);
  assert.equal(set.targetWeight, 100); // the plan is remembered separately from what happened
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, at + 120 * 1000);
});

test('warm-up sets are logged but never start a rest or count toward completion', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench } = await startMonday(db);
  const res = await completeSet(db, warmups(bench)[0].id, { weight: 50, reps: 10 }, MONDAY);
  assert.equal(res.restStarted, false);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, null);
  const reloaded = await W.getWorkoutExercise(db, bench.id);
  assert.deepEqual(setProgress(reloaded), { done: 0, total: 3 });
  assert.equal(reloaded.status, 'pending');
});

test('finishing every working set completes the exercise and updates the count', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, ohp } = await startMonday(db);
  const [s1, s2] = working(ohp);
  await completeSet(db, s1.id, { weight: 60, reps: 10 }, MONDAY);
  assert.equal((await W.getWorkoutExercise(db, ohp.id)).status, 'pending');
  const res = await completeSet(db, s2.id, { weight: 60, reps: 10 }, MONDAY + MIN);
  assert.equal(res.exerciseCompleted, true);
  assert.equal((await W.getWorkoutExercise(db, ohp.id)).status, 'completed');
  assert.equal((await W.getSession(db, sessionId)).exercisesCompleted, 1);
});

test('the very last working set of the workout starts no rest', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench, ohp } = await startMonday(db);
  let last;
  for (const set of [...working(bench), ...working(ohp)]) {
    last = await completeSet(db, set.id, { weight: set.weight, reps: 10 }, MONDAY);
  }
  assert.equal(last.workoutComplete, true);
  assert.equal(last.restStarted, false);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, null);
  assert.equal((await W.getSession(db, sessionId)).exercisesCompleted, 2);
});

test('un-ticking a set reopens the exercise and keeps the values', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, ohp } = await startMonday(db);
  for (const s of working(ohp)) await completeSet(db, s.id, { weight: 60, reps: 10 }, MONDAY);
  await uncompleteSet(db, working(ohp)[1].id);
  const set = await W.getSet(db, working(ohp)[1].id);
  assert.deepEqual([set.completed, set.completedAt, set.reps], [false, null, 10]);
  assert.equal((await W.getWorkoutExercise(db, ohp.id)).status, 'pending');
  assert.equal((await W.getSession(db, sessionId)).exercisesCompleted, 0);
});

test('weight and reps are saved as they are typed, before the set is ticked', async () => {
  const db = await setup();
  await planMonday(db);
  const { bench } = await startMonday(db);
  const id = working(bench)[1].id;
  assert.equal((await saveSetValues(db, id, { weight: 110, reps: 7 })).ok, true);
  const set = await W.getSet(db, id);
  assert.deepEqual([set.weight, set.reps, set.completed], [110, 7, false]);
});

test('bad weight or reps are rejected and nothing is saved', async () => {
  const db = await setup();
  await planMonday(db);
  const { bench } = await startMonday(db);
  const id = working(bench)[0].id;
  for (const bad of [{ weight: -5, reps: 8 }, { weight: 100, reps: 0 }, { weight: 100, reps: 8.5 }, { weight: NaN, reps: 8 }, { weight: 100, reps: 101 }]) {
    const res = await completeSet(db, id, bad, MONDAY);
    assert.equal(res.ok, false, JSON.stringify(bad));
  }
  assert.equal((await W.getSet(db, id)).completed, false);
  assert.equal((await completeSet(db, id, { weight: 0, reps: 12 }, MONDAY)).ok, true); // bodyweight is fine
});

test('extra sets can be added and removed; the last working set cannot be removed', async () => {
  const db = await setup();
  await planMonday(db);
  const { ohp } = await startMonday(db);
  const added = await addSet(db, ohp.id);
  assert.equal(added.ok, true);
  let now = await W.getWorkoutExercise(db, ohp.id);
  assert.deepEqual(working(now).map((s) => s.setNumber), [1, 2, 3]);
  assert.deepEqual([working(now)[2].targetRepMin, working(now)[2].targetWeight, working(now)[2].reps], [10, 60, null]);

  await removeSet(db, working(now)[0].id); // remove set 1: the rest renumber
  now = await W.getWorkoutExercise(db, ohp.id);
  assert.deepEqual(working(now).map((s) => s.setNumber), [1, 2]);

  await completeSet(db, working(now)[0].id, { weight: 60, reps: 10 }, MONDAY);
  assert.equal((await removeSet(db, working(now)[0].id)).ok, false); // done sets must be unticked first
  await removeSet(db, working(now)[1].id);
  now = await W.getWorkoutExercise(db, ohp.id);
  assert.equal(working(now).length, 1);
  assert.equal((await removeSet(db, working(now)[0].id)).ok, false);
  assert.equal(now.status, 'completed'); // its only remaining set is done
});

// ---- Rest timer ---------------------------------------------------------------

test('rest adjustments are clamped and skip clears the timer', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, ohp } = await startMonday(db);
  await completeSet(db, working(ohp)[0].id, { weight: 60, reps: 10 }, MONDAY); // 60 s rest
  await adjustRest(db, sessionId, 15000, MONDAY + 10 * 1000);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, MONDAY + 75000); // 50 s left + 15 s = 65 s from t+10 s
  await adjustRest(db, sessionId, -10 * MIN, MONDAY + 10 * 1000);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, MONDAY + 10 * 1000); // floor: zero left
  await adjustRest(db, sessionId, 60 * MIN, MONDAY + 10 * 1000);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, MONDAY + 10 * 1000 + 15 * MIN); // ceiling: 15 min
  await skipRest(db, sessionId);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, null);
});

// ---- Pause / resume -----------------------------------------------------------

test('pausing freezes the clock and the rest timer, and resuming continues them', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench } = await startMonday(db, MONDAY);
  await completeSet(db, working(bench)[0].id, { weight: 100, reps: 10 }, MONDAY + 10 * MIN); // rest ends +12 min

  await pauseWorkout(db, sessionId, MONDAY + 11 * MIN);
  let s = await W.getSession(db, sessionId);
  assert.equal(s.pausedAt, MONDAY + 11 * MIN);
  assert.equal(elapsedMs(s, MONDAY + 50 * MIN), 11 * MIN); // frozen no matter how long it stays paused
  assert.deepEqual(restState(s, MONDAY + 50 * MIN), { remainingMs: 1 * MIN, over: false, paused: true });

  const blocked = await completeSet(db, working(bench)[1].id, { weight: 100, reps: 10 }, MONDAY + 20 * MIN);
  assert.equal(blocked.ok, false);
  assert.match(blocked.errors[0], /paused/i);

  await resumeWorkout(db, sessionId, MONDAY + 41 * MIN); // paused for 30 min
  s = await W.getSession(db, sessionId);
  assert.equal(s.pausedAt, null);
  assert.equal(s.pausedMs, 30 * MIN);
  assert.equal(elapsedMs(s, MONDAY + 45 * MIN), 15 * MIN); // 45 min on the wall clock minus 30 min paused
  assert.deepEqual(restState(s, MONDAY + 41 * MIN), { remainingMs: 1 * MIN, over: false, paused: false });
  assert.equal((await completeSet(db, working(bench)[1].id, { weight: 100, reps: 10 }, MONDAY + 42 * MIN)).ok, true);
});

test('pause and resume are safe to repeat', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId } = await startMonday(db);
  await pauseWorkout(db, sessionId, MONDAY + MIN);
  await pauseWorkout(db, sessionId, MONDAY + 5 * MIN); // second pause changes nothing
  await resumeWorkout(db, sessionId, MONDAY + 6 * MIN);
  await resumeWorkout(db, sessionId, MONDAY + 9 * MIN); // second resume changes nothing
  const s = await W.getSession(db, sessionId);
  assert.equal(s.pausedMs, 5 * MIN);
  assert.equal(s.pausedAt, null);
});

// ---- Finishing ----------------------------------------------------------------

test('finishing early keeps every logged set and flags the workout as early', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench } = await startMonday(db);
  await completeSet(db, warmups(bench)[0].id, { weight: 50, reps: 10 }, MONDAY);
  await completeSet(db, working(bench)[0].id, { weight: 100, reps: 10 }, MONDAY + 5 * MIN);
  await completeSet(db, working(bench)[1].id, { weight: 100, reps: 9 }, MONDAY + 9 * MIN);

  const res = await finishWorkout(db, sessionId, MONDAY + 20 * MIN);
  assert.deepEqual(res, { ok: true, discarded: false, early: true });

  const s = await W.getSession(db, sessionId);
  assert.equal(s.status, 'completed');
  assert.equal(s.finishedAt, new Date(MONDAY + 20 * MIN).toISOString());
  assert.equal(s.exercisesCompleted, 0);
  assert.equal(s.exercisesPlanned, 2);
  assert.equal(s.restEndsAt, null);
  assert.equal(elapsedMs(s, MONDAY + 999 * MIN), 20 * MIN); // a finished clock stops
  const doneSets = (await W.getWorkoutExercise(db, bench.id)).sets.filter((x) => x.completed);
  assert.equal(doneSets.length, 3);

  const log = await db.get('SELECT * FROM schedule_log WHERE date = ?', ['2026-09-21']);
  assert.deepEqual({ ...log }, { date: '2026-09-21', weekday: 1, day_name: 'Push', outcome: 'completed' });
});

test('finishing while paused does not count the paused time', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, ohp } = await startMonday(db);
  await completeSet(db, working(ohp)[0].id, { weight: 60, reps: 10 }, MONDAY + MIN);
  await pauseWorkout(db, sessionId, MONDAY + 10 * MIN);
  await finishWorkout(db, sessionId, MONDAY + 60 * MIN);
  const s = await W.getSession(db, sessionId);
  assert.equal(s.pausedAt, null);
  assert.equal(elapsedMs(s, MONDAY + 999 * MIN), 10 * MIN);
});

test('finishing a complete workout is not "early"', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench, ohp } = await startMonday(db);
  for (const set of [...working(bench), ...working(ohp)]) await completeSet(db, set.id, { weight: set.weight, reps: 10 }, MONDAY);
  const res = await finishWorkout(db, sessionId, MONDAY + 40 * MIN);
  assert.deepEqual(res, { ok: true, discarded: false, early: false });
});

test('a workout with no working set logged is discarded and leaves no trace', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench } = await startMonday(db);
  await completeSet(db, warmups(bench)[0].id, { weight: 50, reps: 10 }, MONDAY); // warm-up only
  const res = await finishWorkout(db, sessionId, MONDAY + 5 * MIN);
  assert.deepEqual(res, { ok: true, discarded: true, early: false });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM workout_sessions')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM workout_sets')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM schedule_log')).n, 0);
});

test('a finished workout can no longer be changed', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, ohp } = await startMonday(db);
  await completeSet(db, working(ohp)[0].id, { weight: 60, reps: 10 }, MONDAY);
  await finishWorkout(db, sessionId, MONDAY + MIN);
  assert.equal((await completeSet(db, working(ohp)[1].id, { weight: 60, reps: 10 }, MONDAY)).ok, false);
  assert.equal((await saveSetValues(db, working(ohp)[1].id, { weight: 65, reps: 8 })).ok, false);
  assert.equal((await addSet(db, ohp.id)).ok, false);
  assert.equal((await finishWorkout(db, sessionId, MONDAY)).ok, false);
});

// ---- Previous workout ---------------------------------------------------------

test('the exercise screen shows the last finished workout for that exercise', async () => {
  const db = await setup();
  await planMonday(db);

  // Week 1: bench 100 x 10, 9, 8
  const first = await startMonday(db, MONDAY);
  const reps = [10, 9, 8];
  for (let i = 0; i < 3; i++) await completeSet(db, working(first.bench)[i].id, { weight: 100, reps: reps[i] }, MONDAY + i * MIN);
  await completeSet(db, warmups(first.bench)[0].id, { weight: 50, reps: 10 }, MONDAY); // warm-ups are not "previous"
  await finishWorkout(db, first.sessionId, MONDAY + 30 * MIN);

  // Week 2
  const nextMonday = MONDAY + 7 * 24 * 60 * MIN;
  const second = await startMonday(db, nextMonday);
  const screen = await loadExerciseScreen(db, second.bench.id);

  assert.equal(screen.previous.date, '2026-09-21');
  assert.deepEqual(screen.previous.sets.map((s) => [s.weight, s.reps]), [[100, 10], [100, 9], [100, 8]]);
  assert.deepEqual([screen.index, screen.total, screen.previousExerciseId, screen.nextExerciseId], [0, 2, null, second.ohp.id]);
  assert.equal(typeof screen.instructions, 'string');
  assert.deepEqual(screen.defaults, { unit: 'lbs', increment: 5, restSeconds: 90 });

  // Shoulder Press was never done, and the workout in progress never counts as its own "previous".
  const ohpScreen = await loadExerciseScreen(db, second.ohp.id);
  assert.equal(ohpScreen.previous, null);
  assert.deepEqual([ohpScreen.previousExerciseId, ohpScreen.nextExerciseId], [second.bench.id, null]);
});

test('an unfinished or discarded workout is never used as "previous"', async () => {
  const db = await setup();
  await planMonday(db);
  const first = await startMonday(db, MONDAY);
  await completeSet(db, working(first.bench)[0].id, { weight: 100, reps: 10 }, MONDAY); // still in progress
  const screen = await loadExerciseScreen(db, first.bench.id);
  assert.equal(screen.previous, null);
});

test('previous is still found by name after the library exercise is deleted', async () => {
  const db = await setup();
  await planMonday(db);
  const first = await startMonday(db, MONDAY);
  await completeSet(db, working(first.ohp)[0].id, { weight: 60, reps: 10 }, MONDAY);
  await finishWorkout(db, first.sessionId, MONDAY + MIN);
  await db.run('UPDATE workout_exercises SET exercise_id = NULL'); // what ON DELETE SET NULL does
  const second = await startMonday(db, MONDAY + 7 * 24 * 60 * MIN);
  await db.run('UPDATE workout_exercises SET exercise_id = NULL WHERE id = ?', [second.ohp.id]);
  const screen = await loadExerciseScreen(db, second.ohp.id);
  assert.equal(screen.previous.sets.length, 1);
});

// ---- Pure rules ---------------------------------------------------------------

test('formatClock', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(59_999), '0:59');
  assert.equal(formatClock(754_000), '12:34');
  assert.equal(formatClock(3_723_000), '1:02:03');
  assert.equal(formatClock(-5), '0:00');
});

test('restState hides a long-finished rest and marks a just-finished one', () => {
  const base = { restEndsAt: 100_000, pausedAt: null };
  assert.equal(restState({ restEndsAt: null, pausedAt: null }, 0), null);
  assert.deepEqual(restState(base, 40_000), { remainingMs: 60_000, over: false, paused: false });
  assert.deepEqual(restState(base, 130_000), { remainingMs: 0, over: true, paused: false });
  assert.equal(restState(base, 100_000 + 3 * MIN), null);
});

test('defaultReps: entered value, warm-up plan, same-weight previous, otherwise bottom of range', () => {
  const set = { kind: 'working', targetRepMin: 8, targetRepMax: 12, weight: 100, targetWeight: 100, reps: null };
  assert.equal(defaultReps({ ...set, reps: 7 }), 7);
  assert.equal(defaultReps({ kind: 'warmup', targetRepMin: 5, targetRepMax: 5, weight: 75, reps: null }), 5);
  assert.equal(defaultReps(set, { weight: 100, reps: 11 }), 11);
  assert.equal(defaultReps(set, { weight: 95, reps: 11 }), 8); // weight went up since: start low
  assert.equal(defaultReps(set, null), 8);
});

test('validateSetEntry and describeTargets', () => {
  assert.equal(validateSetEntry({ weight: 0, reps: 1 }).ok, true);
  assert.equal(validateSetEntry({ weight: 2001, reps: 5 }).ok, false);
  const ex = (mins) => ({ sets: mins.map(([min, max]) => ({ kind: 'working', targetRepMin: min, targetRepMax: max })) });
  assert.equal(describeTargets(ex([[8, 12], [8, 12], [8, 12]])), '3 × 8–12');
  assert.equal(describeTargets(ex([[12, 12], [10, 10], [8, 8]])), '12 · 10 · 8');
});

// ---- Break between exercises ------------------------------------------------------

async function finishBench(db, bench, at) {
  const sets = working(bench);
  await completeSet(db, sets[0].id, { weight: 100, reps: 10 }, at);
  await completeSet(db, sets[1].id, { weight: 100, reps: 10 }, at);
  return completeSet(db, sets[2].id, { weight: 100, reps: 10 }, at);
}

test('finishing every set of an exercise starts a 5 minute break by default', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench } = await startMonday(db);
  const at = MONDAY + 5 * MIN;
  const res = await finishBench(db, bench, at);
  assert.equal(res.exerciseCompleted, true);
  assert.equal(res.breakSeconds, 300);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, at + 5 * MIN);
});

test('the break can be 10 minutes or turned off, and bad values are refused', async () => {
  const db = await setup();
  assert.equal(await getExerciseBreakSeconds(db), 300);
  assert.equal((await saveExerciseBreakSeconds(db, 7)).ok, false);
  assert.equal((await saveExerciseBreakSeconds(db, 600)).ok, true);

  await planMonday(db);
  const { sessionId, bench } = await startMonday(db);
  const at = MONDAY + 5 * MIN;
  await finishBench(db, bench, at);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, at + 10 * MIN);

  await saveExerciseBreakSeconds(db, 0);
  const db2 = await setup();
  await saveExerciseBreakSeconds(db2, 0);
  await planMonday(db2);
  const second = await startMonday(db2);
  const res = await finishBench(db2, second.bench, at);
  assert.equal(res.breakSeconds, 0);
  assert.equal((await W.getSession(db2, second.sessionId)).restEndsAt, at + 120 * 1000); // the normal 2:00 rest
});

test('no break is started after the last exercise of the workout', async () => {
  const db = await setup();
  await planMonday(db);
  const { sessionId, bench, ohp } = await startMonday(db);
  const at = MONDAY + 5 * MIN;
  await finishBench(db, bench, at);
  const sets = working(ohp);
  await completeSet(db, sets[0].id, { weight: 60, reps: 10 }, at);
  const res = await completeSet(db, sets[1].id, { weight: 60, reps: 10 }, at);
  assert.equal(res.workoutComplete, true);
  assert.equal(res.breakSeconds, 0);
  assert.equal((await W.getSession(db, sessionId)).restEndsAt, null);
});