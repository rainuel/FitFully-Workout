import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/node-db.js';
import { runMigrations } from '../www/js/db/migrations.js';
import { seedIfNeeded } from '../www/js/db/seed.js';
import { addExerciseToDay } from '../www/js/services/program-service.js';
import {
  addExerciseToWorkout,
  addWarmupSet,
  completeSet,
  finishWorkout,
  loadWorkoutHome,
  moveWorkoutExercise,
  removeExerciseFromWorkout,
  startWorkout,
} from '../www/js/services/workout-service.js';

const MONDAY = new Date(2026, 8, 21, 10, 0, 0).getTime();

async function setup() {
  const db = createTestDb();
  await runMigrations(db);
  await seedIfNeeded(db);
  const day = (await db.get('SELECT id FROM program_days WHERE weekday = 1')).id;
  const id = async (n) => (await db.get('SELECT id FROM exercises WHERE name = ?', [n])).id;
  await addExerciseToDay(db, day, await id('Bench Press'));
  await addExerciseToDay(db, day, await id('Shoulder Press'));
  const started = await startWorkout(db, MONDAY);
  return { db, sessionId: started.sessionId, id };
}

const list = async (db, sessionId) => (await loadWorkoutHome(db)).exercises.filter((e) => e.sessionId === sessionId);

test('add exercise: appended with 3 working sets, planned count updated', async () => {
  const { db, sessionId, id } = await setup();
  const r = await addExerciseToWorkout(db, sessionId, await id('Barbell Row').catch(() => id('Bench Press')));
  assert.equal(r.ok, true);
  const ex = await list(db, sessionId);
  assert.equal(ex.length, 3);
  assert.equal(ex[2].position, 3);
  assert.equal(ex[2].sets.filter((s) => s.kind === 'working').length, 3);
  const session = (await loadWorkoutHome(db)).session;
  assert.equal(session.exercisesPlanned, 3);
});

test('remove exercise: positions closed up, last one protected', async () => {
  const { db, sessionId } = await setup();
  const [first] = await list(db, sessionId);
  assert.equal((await removeExerciseFromWorkout(db, first.id)).ok, true);
  const rest = await list(db, sessionId);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].position, 1);
  assert.equal((await loadWorkoutHome(db)).session.exercisesPlanned, 1);
  const blocked = await removeExerciseFromWorkout(db, rest[0].id);
  assert.equal(blocked.ok, false);
});

test('remove exercise with a completed set keeps exercises_completed correct', async () => {
  const { db, sessionId } = await setup();
  const [a] = await list(db, sessionId);
  for (const s of a.sets.filter((x) => x.kind === 'working')) await completeSet(db, s.id, { weight: 100, reps: 10 }, MONDAY);
  assert.equal((await loadWorkoutHome(db)).session.exercisesCompleted, 1);
  await removeExerciseFromWorkout(db, a.id);
  assert.equal((await loadWorkoutHome(db)).session.exercisesCompleted, 0);
});

test('move exercise up/down swaps order; edges are no-ops', async () => {
  const { db, sessionId } = await setup();
  const [a, b] = await list(db, sessionId);
  await moveWorkoutExercise(db, b.id, -1);
  let now = await list(db, sessionId);
  assert.deepEqual(now.map((e) => e.id), [b.id, a.id]);
  await moveWorkoutExercise(db, b.id, -1);
  now = await list(db, sessionId);
  assert.deepEqual(now.map((e) => e.id), [b.id, a.id]);
});

test('add warm-up set: numbered after the existing ones, capped at 5', async () => {
  const { db, sessionId } = await setup();
  const [a] = await list(db, sessionId);
  for (let i = 0; i < 5; i++) assert.equal((await addWarmupSet(db, a.id)).ok, true);
  const r = await addWarmupSet(db, a.id);
  assert.equal(r.ok, false);
  const [again] = await list(db, sessionId);
  assert.deepEqual(again.sets.filter((s) => s.kind === 'warmup').map((s) => s.setNumber), [1, 2, 3, 4, 5]);
});

test('editing is blocked once the workout is finished', async () => {
  const { db, sessionId, id } = await setup();
  const [a] = await list(db, sessionId);
  const s = a.sets.find((x) => x.kind === 'working');
  await completeSet(db, s.id, { weight: 100, reps: 10 }, MONDAY);
  await finishWorkout(db, sessionId, MONDAY + 60000);
  const r = await addExerciseToWorkout(db, sessionId, await id('Bench Press'));
  assert.equal(r.ok, false);
});

test('edit while paused: reorder by ids and remove both work', async () => {
  const { db, sessionId } = await setup();
  const { pauseWorkout } = await import('../www/js/services/workout-service.js');
  const { reorderWorkoutExercises } = await import('../www/js/services/workout-service.js');
  await pauseWorkout(db, sessionId);
  const [a, b] = await list(db, sessionId);
  assert.equal((await reorderWorkoutExercises(db, sessionId, [b.id, a.id])).ok, true);
  const after = await list(db, sessionId);
  assert.deepEqual(after.map((e) => e.id), [b.id, a.id]);
  assert.equal((await reorderWorkoutExercises(db, sessionId, [b.id])).ok, false);
});

test('change unit: converts weights, blocked after a set is ticked', async () => {
  const { db, sessionId } = await setup();
  const { changeWorkoutExerciseUnit } = await import('../www/js/services/workout-service.js');
  const [a, b] = await list(db, sessionId);
  const r = await changeWorkoutExerciseUnit(db, a.id, a.unit === 'kg' ? 'lbs' : 'kg');
  assert.equal(r.ok, true);
  const [a2] = await list(db, sessionId);
  assert.equal(a2.unit, r.unit);
  assert.ok(a2.sets.every((s) => s.unit === r.unit));
  const set = b.sets.find((s) => s.kind === 'working');
  await completeSet(db, set.id, { weight: set.weight ?? 0, reps: 8 });
  assert.equal((await changeWorkoutExerciseUnit(db, b.id, b.unit === 'kg' ? 'lbs' : 'kg')).ok, false);
});
