import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/node-db.js';
import { runMigrations } from '../www/js/db/migrations.js';
import { seedIfNeeded } from '../www/js/db/seed.js';
import { setSetting } from '../www/js/models/settings.js';
import {
  addExerciseToDay,
  getProgramDefaults,
  loadDayEditor,
  loadProgramExercise,
  removeProgramExercise,
  reorderDayExercises,
  saveDay,
  saveProgramExercise,
} from '../www/js/services/program-service.js';
import { removeExercise, saveExercise, filterExercises, loadLibrary } from '../www/js/services/exercise-service.js';

async function setup() {
  const db = createTestDb();
  await runMigrations(db);
  await seedIfNeeded(db);
  return db;
}

const idOf = async (db, name) => (await db.get('SELECT id FROM exercises WHERE name = ?', [name])).id;
const mondayId = async (db) => (await db.get('SELECT id FROM program_days WHERE weekday = 1')).id;

async function addNamed(db, dayId, ...names) {
  const ids = [];
  for (const name of names) {
    const r = await addExerciseToDay(db, dayId, await idOf(db, name));
    assert.equal(r.ok, true);
    ids.push(r.id);
  }
  return ids;
}

test('program defaults come from settings and fall back safely', async () => {
  const db = await setup();
  assert.deepEqual(await getProgramDefaults(db), { unit: 'lbs', increment: 5, restSeconds: 90 });
  await setSetting(db, 'weight_unit', 'kg');
  await setSetting(db, 'weight_increment', '2.5');
  await setSetting(db, 'default_rest_seconds', '120');
  assert.deepEqual(await getProgramDefaults(db), { unit: 'kg', increment: 2.5, restSeconds: 120 });
  await setSetting(db, 'weight_increment', 'banana');
  assert.equal((await getProgramDefaults(db)).increment, 5);
});

test('adding an exercise gives it a 3 × 8–12 starting plan at the end of the day', async () => {
  const db = await setup();
  const dayId = await mondayId(db);
  const [a, b] = await addNamed(db, dayId, 'Bench Press', 'Incline Dumbbell Press');
  const { exercises, day } = await loadDayEditor(db, 1);
  assert.equal(day.exerciseCount, 2);
  assert.deepEqual(exercises.map((e) => [e.id, e.position, e.name]), [[a, 1, 'Bench Press'], [b, 2, 'Incline Dumbbell Press']]);
  assert.deepEqual(exercises[0].workingSets, [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }]);
  assert.equal(exercises[0].weightUnit, 'lbs');
  assert.equal(exercises[0].restSeconds, 90);
  assert.deepEqual(exercises[0].warmupSets, []);
});

test('saving stores working sets, per-set exact reps, and warm-ups separately', async () => {
  const db = await setup();
  const [id] = await addNamed(db, await mondayId(db), 'Bench Press');
  const result = await saveProgramExercise(db, id, {
    workingWeight: 30,
    weightUnit: 'lbs',
    restSeconds: 120,
    notes: 'Pause on the chest',
    workingSets: [{ min: 12, max: 12 }, { min: 10, max: 10 }, { min: 8, max: 8 }],
    warmupSets: [{ reps: 10, weight: 20 }, { reps: 5, weight: 25 }],
  });
  assert.equal(result.ok, true);

  const pe = await loadProgramExercise(db, id);
  assert.equal(pe.workingWeight, 30);
  assert.equal(pe.restSeconds, 120);
  assert.equal(pe.notes, 'Pause on the chest');
  assert.deepEqual(pe.workingSets, [{ min: 12, max: 12 }, { min: 10, max: 10 }, { min: 8, max: 8 }]);
  assert.deepEqual(pe.warmupSets, [{ reps: 10, weight: 20 }, { reps: 5, weight: 25 }]);
  assert.equal(pe.weekday, 1);

  // Saving again with fewer sets replaces, never duplicates.
  await saveProgramExercise(db, id, {
    workingWeight: 32.5, weightUnit: 'kg', restSeconds: 60, notes: '',
    workingSets: [{ min: 6, max: 8 }], warmupSets: [],
  });
  const again = await loadProgramExercise(db, id);
  assert.deepEqual(again.workingSets, [{ min: 6, max: 8 }]);
  assert.deepEqual(again.warmupSets, []);
  assert.equal(again.weightUnit, 'kg');
  assert.equal(again.notes, null);
  const n = await db.get('SELECT COUNT(*) AS n FROM program_sets WHERE program_exercise_id = ?', [id]);
  assert.equal(n.n, 1);
});

test('an invalid save is rejected and changes nothing', async () => {
  const db = await setup();
  const [id] = await addNamed(db, await mondayId(db), 'Bench Press');
  const r = await saveProgramExercise(db, id, {
    workingWeight: 30, weightUnit: 'lbs', restSeconds: 90, notes: '',
    workingSets: [{ min: 12, max: 8 }], warmupSets: [],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
  const pe = await loadProgramExercise(db, id);
  assert.equal(pe.workingSets.length, 3);
  assert.equal(pe.workingWeight, 0);
});

test('reordering renumbers positions and rejects a wrong list', async () => {
  const db = await setup();
  const dayId = await mondayId(db);
  const [a, b, c] = await addNamed(db, dayId, 'Bench Press', 'Shoulder Press', 'Lateral Raise');
  await reorderDayExercises(db, dayId, [c, a, b]);
  const { exercises } = await loadDayEditor(db, 1);
  assert.deepEqual(exercises.map((e) => e.id), [c, a, b]);
  assert.deepEqual(exercises.map((e) => e.position), [1, 2, 3]);

  await assert.rejects(reorderDayExercises(db, dayId, [a, b]), /order/i);
  await assert.rejects(reorderDayExercises(db, dayId, [a, a, b]), /order/i);
  await assert.rejects(reorderDayExercises(db, dayId, [a, b, 9999]), /order/i);
  const after = await loadDayEditor(db, 1);
  assert.deepEqual(after.exercises.map((e) => e.id), [c, a, b], 'a rejected reorder changes nothing');
});

test('removing an exercise closes the gap and deletes its sets', async () => {
  const db = await setup();
  const dayId = await mondayId(db);
  const [a, b, c] = await addNamed(db, dayId, 'Bench Press', 'Shoulder Press', 'Lateral Raise');
  await removeProgramExercise(db, b);
  const { exercises } = await loadDayEditor(db, 1);
  assert.deepEqual(exercises.map((e) => [e.id, e.position]), [[a, 1], [c, 2]]);
  const orphans = await db.get('SELECT COUNT(*) AS n FROM program_sets WHERE program_exercise_id = ?', [b]);
  assert.equal(orphans.n, 0);
});

test('removing an exercise from the program never touches workout history', async () => {
  const db = await setup();
  const [id] = await addNamed(db, await mondayId(db), 'Bench Press');
  const session = await db.run(
    `INSERT INTO workout_sessions (session_date, weekday, day_name, status, started_at, exercises_planned)
     VALUES ('2026-09-14', 1, 'Push', 'completed', '2026-09-14T10:00:00Z', 1)`,
  );
  const we = await db.run(
    `INSERT INTO workout_exercises (session_id, exercise_id, program_exercise_id, exercise_name, position, target_weight, weight_unit)
     VALUES (?, ?, ?, 'Bench Press', 1, 25, 'lbs')`,
    [session.lastId, await idOf(db, 'Bench Press'), id],
  );
  await db.run(
    `INSERT INTO workout_sets (workout_exercise_id, kind, set_number, weight, reps, weight_unit, completed)
     VALUES (?, 'working', 1, 25, 12, 'lbs', 1)`,
    [we.lastId],
  );

  // Change the plan, then delete it.
  await saveProgramExercise(db, id, {
    workingWeight: 30, weightUnit: 'lbs', restSeconds: 90, notes: '',
    workingSets: [{ min: 8, max: 12 }], warmupSets: [],
  });
  await removeProgramExercise(db, id);

  const row = await db.get('SELECT exercise_name, target_weight, program_exercise_id FROM workout_exercises WHERE id = ?', [we.lastId]);
  assert.deepEqual({ ...row }, { exercise_name: 'Bench Press', target_weight: 25, program_exercise_id: null });
  const set = await db.get('SELECT weight, reps FROM workout_sets WHERE workout_exercise_id = ?', [we.lastId]);
  assert.deepEqual({ ...set }, { weight: 25, reps: 12 });
});

test('days can be renamed and turned into rest days, keeping their exercises', async () => {
  const db = await setup();
  const dayId = await mondayId(db);
  await addNamed(db, dayId, 'Bench Press');

  assert.equal((await saveDay(db, dayId, { name: '', isRest: false })).ok, false);
  assert.equal((await saveDay(db, dayId, { name: 'Chest & Tris', isRest: false })).ok, true);
  assert.equal((await loadDayEditor(db, 1)).day.name, 'Chest & Tris');

  await saveDay(db, dayId, { name: 'Chest & Tris', isRest: true });
  let { day, exercises } = await loadDayEditor(db, 1);
  assert.equal(day.isRest, true);
  assert.equal(exercises.length, 1, 'exercises are kept while the day is a rest day');

  await saveDay(db, dayId, { name: 'Chest & Tris', isRest: false });
  ({ day, exercises } = await loadDayEditor(db, 1));
  assert.equal(day.isRest, false);
  assert.equal(exercises.length, 1);

  await saveDay(db, (await db.get('SELECT id FROM program_days WHERE weekday = 4')).id, { name: 'Arms', isRest: false });
  assert.equal((await loadDayEditor(db, 4)).day.isRest, false, 'a rest day can become a training day');
  assert.equal(await loadDayEditor(db, 8), null);
});

test('custom exercises: create, reject duplicates, edit, delete or archive', async () => {
  const db = await setup();
  const created = await saveExercise(db, null, { name: '  Cable Pullover ', muscleGroup: 'Back', instructions: 'Pull with straight arms.', notes: '' });
  assert.equal(created.ok, true);

  const dupe = await saveExercise(db, null, { name: 'cable pullover', muscleGroup: 'Back' });
  assert.equal(dupe.ok, false);
  const dupeBuiltIn = await saveExercise(db, null, { name: 'bench press', muscleGroup: 'Chest' });
  assert.equal(dupeBuiltIn.ok, false);
  assert.equal((await saveExercise(db, null, { name: '   ' })).ok, false);

  // Editing itself is not a duplicate.
  assert.equal((await saveExercise(db, created.id, { name: 'Cable Pullover', muscleGroup: 'Back', instructions: 'Updated' })).ok, true);
  assert.equal((await loadLibrary(db)).find((e) => e.id === created.id).instructions, 'Updated');

  // Built-ins can be edited but never removed.
  const bench = await idOf(db, 'Bench Press');
  assert.equal((await removeExercise(db, bench)).ok, false);

  // Unused custom exercise is deleted outright.
  const gone = await removeExercise(db, created.id);
  assert.deepEqual({ ...gone }, { ok: true, outcome: 'deleted' });

  // A custom exercise used by the program is archived instead, and the program keeps it.
  const used = await saveExercise(db, null, { name: 'Landmine Press', muscleGroup: 'Shoulders' });
  const [peId] = [(await addExerciseToDay(db, await mondayId(db), used.id)).id];
  const hidden = await removeExercise(db, used.id);
  assert.deepEqual({ ...hidden }, { ok: true, outcome: 'archived' });
  assert.equal((await loadLibrary(db)).some((e) => e.id === used.id), false);
  assert.equal((await loadProgramExercise(db, peId)).name, 'Landmine Press');
});

test('library filtering by search text and muscle group', async () => {
  const db = await setup();
  const all = await loadLibrary(db);
  assert.ok(filterExercises(all, { query: 'bench' }).every((e) => /bench/i.test(e.name)));
  assert.ok(filterExercises(all, { muscle: 'Chest' }).every((e) => e.muscleGroup === 'Chest'));
  assert.equal(filterExercises(all, { query: 'zzzz' }).length, 0);
  assert.equal(filterExercises(all).length, all.length);
});
