import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/node-db.js';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '../www/js/db/migrations.js';

const EXPECTED_TABLES = [
  'achievements', 'bodyweight_records', 'exercises', 'profile', 'program_days', 'program_exercises',
  'program_sets', 'programs', 'progression_events', 'schedule_log', 'schema_migrations', 'settings',
  'workout_exercises', 'workout_sessions', 'workout_sets',
];

async function freshDb() {
  const db = createTestDb();
  await runMigrations(db);
  return db;
}

test('migrations create every table on a fresh database', async () => {
  const db = await freshDb();
  const rows = await db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  assert.deepEqual(rows.map((r) => r.name), EXPECTED_TABLES);
});

test('running migrations again does nothing', async () => {
  const db = await freshDb();
  const again = await runMigrations(db);
  assert.equal(again.from, LATEST_SCHEMA_VERSION);
  assert.equal(again.to, LATEST_SCHEMA_VERSION);
  const rows = await db.all('SELECT version FROM schema_migrations');
  assert.equal(rows.length, MIGRATIONS.length);
});

test('foreign keys are enforced', async () => {
  const db = await freshDb();
  await assert.rejects(
    db.run(`INSERT INTO program_days (program_id, weekday, name, is_rest) VALUES (999, 1, 'Ghost', 0)`),
    /FOREIGN KEY/i,
  );
});

test('deleting a program cascades to its days', async () => {
  const db = await freshDb();
  const p = await db.run(`INSERT INTO programs (name) VALUES ('P')`);
  await db.run(`INSERT INTO program_days (program_id, weekday, name) VALUES (?, 1, 'Push')`, [p.lastId]);
  await db.run('DELETE FROM programs WHERE id = ?', [p.lastId]);
  const left = await db.get('SELECT COUNT(*) AS n FROM program_days');
  assert.equal(left.n, 0);
});

test('history survives deleting an exercise or program exercise (name snapshot kept)', async () => {
  const db = await freshDb();
  const ex = await db.run(`INSERT INTO exercises (name) VALUES ('Shoulder Press')`);
  const s = await db.run(
    `INSERT INTO workout_sessions (session_date, weekday, day_name, status, started_at, exercises_planned)
     VALUES ('2026-09-10', 4, 'Upper', 'completed', '2026-09-10T10:00:00Z', 1)`,
  );
  const we = await db.run(
    `INSERT INTO workout_exercises (session_id, exercise_id, exercise_name, position, target_weight, weight_unit)
     VALUES (?, ?, 'Shoulder Press', 1, 25, 'lbs')`,
    [s.lastId, ex.lastId],
  );
  await db.run(
    `INSERT INTO workout_sets (workout_exercise_id, kind, set_number, weight, reps, weight_unit, completed)
     VALUES (?, 'working', 1, 25, 12, 'lbs', 1)`,
    [we.lastId],
  );

  await db.run('DELETE FROM exercises WHERE id = ?', [ex.lastId]);

  const row = await db.get('SELECT exercise_id, exercise_name FROM workout_exercises WHERE id = ?', [we.lastId]);
  assert.equal(row.exercise_id, null);
  assert.equal(row.exercise_name, 'Shoulder Press');
  const set = await db.get('SELECT weight, reps FROM workout_sets WHERE workout_exercise_id = ?', [we.lastId]);
  assert.deepEqual({ ...set }, { weight: 25, reps: 12 });
});

test('only one workout can be in progress at a time', async () => {
  const db = await freshDb();
  const insert = () =>
    db.run(
      `INSERT INTO workout_sessions (session_date, weekday, day_name, status, started_at, exercises_planned)
       VALUES ('2026-09-21', 1, 'Push', 'in_progress', '2026-09-21T10:00:00Z', 4)`,
    );
  await insert();
  await assert.rejects(insert(), /UNIQUE/i);
});

test('a failed transaction rolls back completely', async () => {
  const db = await freshDb();
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.run(`INSERT INTO programs (name) VALUES ('Will vanish')`);
      throw new Error('boom');
    }),
    /boom/,
  );
  const row = await db.get('SELECT COUNT(*) AS n FROM programs');
  assert.equal(row.n, 0);
});

test('queries wait for an open transaction instead of running inside it', async () => {
  const db = await freshDb();
  const tx = db.transaction(async (t) => {
    await t.run(`INSERT INTO programs (name) VALUES ('Slow')`);
    await new Promise((r) => setTimeout(r, 30));
  });
  const read = db.get('SELECT COUNT(*) AS n FROM programs'); // queued behind the transaction
  await tx;
  assert.equal((await read).n, 1);
});
