import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/node-db.js';
import { runMigrations } from '../www/js/db/migrations.js';
import { seedIfNeeded } from '../www/js/db/seed.js';
import { addExerciseToDay, saveProgramExercise } from '../www/js/services/program-service.js';
import { completeSet, finishWorkout, loadExerciseScreen, startWorkout } from '../www/js/services/workout-service.js';
import {
  assessExercise,
  commitProgression,
  commitWorkingWeight,
  getCommitOffer,
  getExerciseProgression,
  getSessionProgression,
  keepWeight,
  loadIncrementSettings,
  saveWeightIncrement,
} from '../www/js/services/progression-service.js';
import { evaluateProgression, nextWeight, validateIncrement } from '../www/js/services/progression-rules.js';
import * as W from '../www/js/models/workout.js';
import { getProgramExercise } from '../www/js/models/program.js';
import { countWeightIncreases } from '../www/js/models/progression.js';

const MONDAY = new Date(2026, 8, 21, 10, 0, 0).getTime();

const set = (over) => ({ kind: 'working', completed: true, reps: 12, weight: 25, targetRepMin: 8, targetRepMax: 12, targetWeight: 25, ...over });

// ---- Rules -----------------------------------------------------------------

test('eligible when every working set hit the top of the range at the planned weight', () => {
  const r = evaluateProgression({ sets: [set(), set(), set()], increment: 5 });
  assert.equal(r.state, 'eligible');
  assert.equal(r.suggestedWeight, 30);
  assert.equal(r.totalSets, 3);
});

test('not reached when any set falls short; nothing is suggested', () => {
  const r = evaluateProgression({ sets: [set(), set({ reps: 8 }), set({ reps: 7 })], increment: 5 });
  assert.equal(r.state, 'not_reached');
  assert.equal(r.suggestedWeight, null);
});

test('warm-ups are ignored', () => {
  const r = evaluateProgression({ sets: [set({ kind: 'warmup', reps: 3, weight: 10 }), set(), set()], increment: 5 });
  assert.equal(r.state, 'eligible');
});

test('incomplete when a working set was not done', () => {
  assert.equal(evaluateProgression({ sets: [set(), set({ completed: false, reps: null })], increment: 5 }).state, 'incomplete');
});

test('lifting below the planned weight is not eligible', () => {
  assert.equal(evaluateProgression({ sets: [set({ weight: 20 }), set(), set()], increment: 5 }).state, 'not_reached');
});

test('lifting above the plan suggests from the lowest weight lifted', () => {
  const r = evaluateProgression({ sets: [set({ weight: 30 }), set({ weight: 30 })], increment: 5 });
  assert.equal(r.state, 'eligible');
  assert.equal(r.suggestedWeight, 35);
});

test('exact-rep targets: hitting each set’s own top counts', () => {
  const sets = [set({ targetRepMin: 12, targetRepMax: 12, reps: 12 }), set({ targetRepMin: 10, targetRepMax: 10, reps: 10 })];
  assert.equal(evaluateProgression({ sets, increment: 2.5 }).state, 'eligible');
});

test('bodyweight exercises have no weight progression', () => {
  assert.equal(evaluateProgression({ sets: [set({ weight: 0, targetWeight: 0 })], increment: 5 }).state, 'not_applicable');
});

test('increment maths and validation', () => {
  assert.equal(nextWeight(27.5, 2.5), 30);
  assert.equal(validateIncrement('2.5').value, 2.5);
  assert.equal(validateIncrement(0).ok, false);
  assert.equal(validateIncrement('abc').ok, false);
});

// ---- Service ---------------------------------------------------------------

async function setup() {
  const db = createTestDb();
  await runMigrations(db);
  await seedIfNeeded(db);
  return db;
}

/** Monday: Shoulder Press, 3 × 8–12 at 25 lbs. */
async function planShoulderPress(db) {
  const day = (await db.get('SELECT id FROM program_days WHERE weekday = 1')).id;
  const lib = (await db.get(`SELECT id FROM exercises WHERE name = 'Shoulder Press'`)).id;
  const added = await addExerciseToDay(db, day, lib);
  await saveProgramExercise(db, added.id, {
    workingWeight: 25,
    weightUnit: 'lbs',
    restSeconds: 60,
    notes: '',
    workingSets: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }],
    warmupSets: [],
  });
  return added.id;
}

async function doWorkout(db, reps, at = MONDAY, weight = 25) {
  const { sessionId } = await startWorkout(db, at);
  const [ex] = await W.getSessionExercises(db, sessionId);
  for (let i = 0; i < ex.sets.length; i++) {
    const r = await completeSet(db, ex.sets[i].id, { weight, reps: reps[i] }, at);
    assert.equal(r.ok, true);
  }
  return { sessionId, exId: ex.id };
}

test('finishing at the top of the range records "eligible" and does NOT change the program', async () => {
  const db = await setup();
  const pe = await planShoulderPress(db);
  const { sessionId, exId } = await doWorkout(db, [12, 12, 12]);
  await finishWorkout(db, sessionId, MONDAY + 3600000);

  const p = await getExerciseProgression(db, exId);
  assert.equal(p.state, 'eligible');
  assert.equal(p.suggestedWeight, 30);
  assert.equal((await W.getWorkoutExercise(db, exId)).progressionState, 'eligible');
  assert.equal((await getProgramExercise(db, pe)).workingWeight, 25);
});

test('COMMIT updates the program weight, logs the event, and leaves history untouched', async () => {
  const db = await setup();
  const pe = await planShoulderPress(db);
  const { sessionId, exId } = await doWorkout(db, [12, 12, 12]);
  await finishWorkout(db, sessionId, MONDAY + 3600000);

  const r = await commitProgression(db, exId);
  assert.deepEqual([r.ok, r.from, r.to], [true, 25, 30]);
  assert.equal((await getProgramExercise(db, pe)).workingWeight, 30);
  assert.equal(await countWeightIncreases(db), 1);

  const ex = await W.getWorkoutExercise(db, exId);
  assert.equal(ex.progressionState, 'committed');
  assert.deepEqual(ex.sets.map((s) => [s.weight, s.reps]), [[25, 12], [25, 12], [25, 12]]);
  assert.equal(ex.targetWeight, 25);

  assert.equal((await commitProgression(db, exId)).ok, false); // already decided
  assert.equal((await getExerciseProgression(db, exId)).state, 'committed');
});

test('KEEP leaves the program unchanged and is remembered', async () => {
  const db = await setup();
  const pe = await planShoulderPress(db);
  const { sessionId, exId } = await doWorkout(db, [12, 12, 12]);
  await finishWorkout(db, sessionId, MONDAY + 3600000);

  assert.equal((await keepWeight(db, exId)).ok, true);
  assert.equal((await getProgramExercise(db, pe)).workingWeight, 25);
  assert.equal((await getExerciseProgression(db, exId)).state, 'kept');
  assert.equal(await countWeightIncreases(db), 0);
  assert.equal((await commitProgression(db, exId)).ok, false);
});

test('missing the target keeps the weight, records "not_reached", and never lowers it', async () => {
  const db = await setup();
  const pe = await planShoulderPress(db);
  const { sessionId, exId } = await doWorkout(db, [12, 8, 7]);
  await finishWorkout(db, sessionId, MONDAY + 3600000);

  assert.equal((await getExerciseProgression(db, exId)).state, 'not_reached');
  assert.equal((await W.getWorkoutExercise(db, exId)).progressionState, 'not_reached');
  assert.equal((await getProgramExercise(db, pe)).workingWeight, 25);
  assert.equal((await commitProgression(db, exId)).ok, false);
  assert.equal((await keepWeight(db, exId)).ok, false);
});

test('a partly done exercise gets no verdict', async () => {
  const db = await setup();
  await planShoulderPress(db);
  const { sessionId } = await startWorkout(db, MONDAY);
  const [ex] = await W.getSessionExercises(db, sessionId);
  await completeSet(db, ex.sets[0].id, { weight: 25, reps: 12 }, MONDAY);
  await finishWorkout(db, sessionId, MONDAY + 60000);
  assert.equal((await W.getWorkoutExercise(db, ex.id)).progressionState, null);
  assert.equal((await getSessionProgression(db, sessionId)).length, 0);
});

test('logging a different weight never changes the program; committing it is explicit', async () => {
  const db = await setup();
  const pe = await planShoulderPress(db);
  const { sessionId, exId } = await doWorkout(db, [10, 9, 8], MONDAY, 30);
  await finishWorkout(db, sessionId, MONDAY + 3600000);

  assert.equal((await getProgramExercise(db, pe)).workingWeight, 25);
  const offer = await getCommitOffer(db, exId);
  assert.deepEqual([offer.weight, offer.currentWeight], [30, 25]);

  assert.equal((await commitWorkingWeight(db, exId, 30)).ok, true);
  assert.equal((await getProgramExercise(db, pe)).workingWeight, 30);
  assert.equal(await getCommitOffer(db, exId), null);
  assert.equal((await commitWorkingWeight(db, exId, 30)).ok, false);
  assert.equal((await commitWorkingWeight(db, exId, -5)).ok, false);
});

test('uses the configured increment', async () => {
  const db = await setup();
  await planShoulderPress(db);
  assert.equal((await saveWeightIncrement(db, 2.5)).ok, true);
  assert.deepEqual(await loadIncrementSettings(db), { unit: 'lbs', increment: 2.5 });
  assert.equal((await saveWeightIncrement(db, 0)).ok, false);

  const { sessionId, exId } = await doWorkout(db, [12, 12, 12]);
  await finishWorkout(db, sessionId, MONDAY + 3600000);
  assert.equal((await getExerciseProgression(db, exId)).suggestedWeight, 27.5);
});

test('once the program already uses the suggested weight, the prompt is "applied"', async () => {
  const db = await setup();
  const pe = await planShoulderPress(db);
  const { sessionId, exId } = await doWorkout(db, [12, 12, 12]);
  await finishWorkout(db, sessionId, MONDAY + 3600000);
  await saveProgramExercise(db, pe, {
    workingWeight: 30, weightUnit: 'lbs', restSeconds: 60, notes: '',
    workingSets: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }], warmupSets: [],
  });
  assert.equal((await getExerciseProgression(db, exId)).state, 'applied');
});

test('an exercise removed from the program can no longer be committed', async () => {
  const db = await setup();
  const pe = await planShoulderPress(db);
  const { sessionId, exId } = await doWorkout(db, [12, 12, 12]);
  await finishWorkout(db, sessionId, MONDAY + 3600000);
  await db.run('DELETE FROM program_exercises WHERE id = ?', [pe]);
  assert.equal((await commitProgression(db, exId)).ok, false);
  assert.equal((await loadExerciseScreen(db, exId)).progression.canCommit, false);
});

test('evaluateProgression exposes each set and the rep range when the top was not reached', () => {
  const r = evaluateProgression({
    sets: [set({ weight: 30, reps: 8 }), set({ weight: 30, reps: 12 }), set({ weight: 25, reps: 7 })],
    increment: 5,
  });
  assert.equal(r.state, 'not_reached');
  assert.deepEqual(r.sets.map((s) => [s.weight, s.reps]), [[30, 8], [30, 12], [25, 7]]);
  assert.equal(r.targetRepMax, 12);
});